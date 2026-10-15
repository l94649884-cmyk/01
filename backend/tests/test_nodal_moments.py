import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.models import BeamModel
from app.solver import ModelError, solve_beam


def cantilever(value=10):
    return dict(schemaVersion=1, name="节点集中弯矩", nodes=[dict(id="N1", x=0, y=0), dict(id="N2", x=3, y=0)],
                members=[dict(id="B1", start="N1", end="N2", E=210, I=8000)],
                supports=[dict(id="S1", nodeId="N1", kind="fixed")], pointLoads=[], distributedLoads=[],
                moments=[dict(id="M1", nodeId="N2", value=value, side="right")])


def compute(data):
    return solve_beam(BeamModel.model_validate(data))


@pytest.mark.parametrize("value", [10, -10])
def test_cantilever_end_moment_matches_constant_moment_and_exact_displacement(value):
    result = compute(cantilever(value))
    assert result["reactions"][0]["moment"] == pytest.approx(-value, abs=1e-9)
    assert result["reactions"][0]["vertical"] == pytest.approx(0, abs=1e-9)
    assert [p["moment"] for p in result["samples"]] == pytest.approx([value]*len(result["samples"]), abs=1e-9)
    assert [p["shear"] for p in result["samples"]] == pytest.approx([0]*len(result["samples"]), abs=1e-9)
    assert result["nodalDisplacements"][1]["uy"] == pytest.approx(value*3**2/(2*16800), abs=1e-10)
    assert result["nodalDisplacements"][1]["rotation"] == pytest.approx(value*3/16800, abs=1e-10)
    assert result["equilibrium"]["moment"] == pytest.approx(0, abs=1e-9)


@pytest.mark.parametrize("reverse", [False, True])
def test_midspan_nodal_moment_creates_a_moment_jump_and_opposite_reactions(reverse):
    data = cantilever()
    data["nodes"] = [dict(id="N1", x=0, y=0), dict(id="N2", x=6, y=0), dict(id="N3", x=3, y=0)]
    data["members"] = [dict(id="B1", start="N1", end="N3", E=210, I=8000), dict(id="B2", start="N3", end="N2", E=210, I=8000)]
    if reverse:
        for member in data["members"]:
            member["start"], member["end"] = member["end"], member["start"]
    data["supports"] = [dict(id="S1", nodeId="N1", kind="pin"), dict(id="S2", nodeId="N2", kind="roller")]
    data["moments"][0]["nodeId"] = "N3"
    result = compute(data)
    assert [r["vertical"] for r in result["reactions"]] == pytest.approx([10/6, -10/6], abs=1e-9)
    at = [sample for sample in result["samples"] if sample["x"] == 3]
    assert [s["moment"] for s in at] == pytest.approx([5, -5], abs=1e-9)
    assert [s["shear"] for s in at] == pytest.approx([10/6, 10/6], abs=1e-9)
    assert abs(result["extrema"]["moment"]["moment"]) == pytest.approx(5, abs=1e-9)
    assert result["equilibrium"]["moment"] == pytest.approx(0, abs=1e-9)


def test_moment_on_restrained_node_is_balanced_by_support_without_member_bending():
    data = cantilever(); data["moments"][0]["nodeId"] = "N1"
    result = compute(data)
    assert result["reactions"][0]["moment"] == pytest.approx(-10)
    assert result["extrema"]["moment"]["moment"] == pytest.approx(0)
    assert result["extrema"]["displacement"]["displacement"] == pytest.approx(0)


def test_display_side_and_coincident_moments_do_not_change_physical_sign():
    data = cantilever(); right = compute(data)
    data["moments"][0]["side"] = "left"; assert compute(data) == right
    data["moments"].append(dict(id="M2", nodeId="N2", value=-4, side="right"))
    assert compute(data)["extrema"]["moment"]["moment"] == pytest.approx(6)


def test_moment_and_point_force_superpose():
    data = cantilever(); data["pointLoads"] = [dict(id="P1", memberId="B1", at=3, value=10)]
    result = compute(data)
    assert result["reactions"][0]["vertical"] == pytest.approx(10)
    assert result["reactions"][0]["moment"] == pytest.approx(20)
    assert result["samples"][0]["moment"] == pytest.approx(-20)
    assert result["samples"][-1]["moment"] == pytest.approx(10)


@pytest.mark.parametrize("patch", [dict(nodeId="missing"), dict(id="N1"), dict(side="top"), dict(value=1e7), dict(value=float("nan"))])
def test_invalid_moment_data_is_rejected(patch):
    data = cantilever(); data["moments"][0].update(patch)
    with pytest.raises((ValidationError, ModelError)):
        compute(data)


def test_api_accepts_legacy_files_and_validates_moment_references():
    client = TestClient(app)
    data = cantilever(); response = client.post('/api/solve', json=data)
    assert response.status_code == 200
    assert response.json()["reactions"][0]["moment"] == pytest.approx(-10)
    data["moments"][0]["nodeId"] = "missing"
    assert client.post('/api/solve', json=data).status_code == 422
    del data["moments"]
    assert BeamModel.model_validate(data).moments == []
    assert client.post('/api/solve', json=data).status_code == 200


def test_moment_count_limit():
    data = cantilever(); data["moments"] = [dict(id=f"M{i}", nodeId="N2", value=1) for i in range(101)]
    with pytest.raises(ValidationError):
        BeamModel.model_validate(data)
