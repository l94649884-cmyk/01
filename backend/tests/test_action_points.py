import math

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.models import BeamModel
from app.solver import ModelError, solve_beam


def fixture(at=2, value=10):
    return dict(schemaVersion=1, name="杆内作用点", nodes=[dict(id="N1", x=0, y=0), dict(id="N2", x=6, y=0)],
                members=[dict(id="B1", start="N1", end="N2", E=210, I=8000)],
                supports=[dict(id="S1", nodeId="N1", kind="pin"), dict(id="S2", nodeId="N2", kind="roller")],
                pointLoads=[], distributedLoads=[], actionPoints=[dict(id="A1", memberId="B1", at=at)],
                moments=[dict(id="M1", pointId="A1", value=value, side="center")])


def compute(data):
    return solve_beam(BeamModel.model_validate(data))


@pytest.mark.parametrize("value", [10, -10])
@pytest.mark.parametrize("reverse", [False, True])
def test_interior_couple_has_exact_reactions_jump_and_continuous_displacement(value, reverse):
    data = fixture(1.73, value)
    if reverse:
        data["members"][0].update(start="N2", end="N1")
        data["actionPoints"][0]["at"] = 6-1.73
    result = compute(data)
    assert len(data["nodes"]) == 2 and len(data["members"]) == 1
    assert result["diagnostics"]["meshNodes"] == 3
    assert [r["vertical"] for r in result["reactions"]] == pytest.approx([value/6, -value/6])
    left, right = [p for p in result["samples"] if abs(p["x"]-1.73) < 1e-8]
    assert left["moment"] == pytest.approx(value*1.73/6)
    assert right["moment"] == pytest.approx(value*1.73/6-value)
    assert left["shear"] == pytest.approx(right["shear"])
    assert left["uy"] == pytest.approx(right["uy"], abs=1e-12)
    assert result["equilibrium"]["moment"] == pytest.approx(0, abs=1e-9)


@pytest.mark.parametrize("angle", [0, math.pi/2, math.pi/4])
def test_interior_cantilever_couple_exact_deflection_for_any_orientation(angle):
    data = fixture(2)
    data["supports"] = [dict(id="S1", nodeId="N1", kind="fixed")]
    data["nodes"][1].update(x=6*math.cos(angle), y=6*math.sin(angle))
    result = compute(data)
    displacement = 10*2*(6-2/2)/16800
    tip = result["nodalDisplacements"][1]
    assert tip["ux"] == pytest.approx(-math.sin(angle)*displacement, abs=1e-10)
    assert tip["uy"] == pytest.approx(math.cos(angle)*displacement, abs=1e-10)
    assert tip["rotation"] == pytest.approx(10*2/16800)
    assert result["reactions"][0]["moment"] == pytest.approx(-10)
    assert result["segments"][0]["M0"] == pytest.approx(10)
    assert result["segments"][1]["M0"] == pytest.approx(0, abs=1e-9)


def test_three_display_positions_are_physically_identical_and_unused_points_do_not_mesh():
    data = fixture(); center = compute(data)
    for side in ["left", "right"]:
        data["moments"][0]["side"] = side
        assert compute(data) == center
    data["actionPoints"].append(dict(id="A2", memberId="B1", at=1))
    assert compute(data) == center


@pytest.mark.parametrize("at", [0, 6])
def test_point_at_endpoint_shares_mesh_node_and_superposes_with_nodal_moment(at):
    data = fixture(at)
    data["supports"] = [dict(id="S1", nodeId="N1", kind="fixed")]
    node = "N1" if at == 0 else "N2"
    data["moments"].append(dict(id="M2", nodeId=node, value=-4, side="left"))
    result = compute(data)
    assert result["diagnostics"]["meshNodes"] == 2
    assert result["reactions"][0]["moment"] == pytest.approx(-6)
    assert abs(result["extrema"]["moment"]["moment"]) == pytest.approx(0 if at == 0 else 6)


def test_shared_force_udl_boundary_and_multiple_couples_at_same_station():
    data = fixture(3)
    data["pointLoads"] = [dict(id="P1", memberId="B1", at=3, value=10)]
    data["distributedLoads"] = [dict(id="Q1", memberId="B1", start=0, end=3, value=2)]
    data["actionPoints"].append(dict(id="A2", memberId="B1", at=3))
    data["moments"].append(dict(id="M2", pointId="A2", value=-4))
    result = compute(data)
    assert result["diagnostics"]["meshNodes"] == 3
    assert [r["vertical"] for r in result["reactions"]] == pytest.approx([10.5, 5.5])
    left, right = [p for p in result["samples"] if p["x"] == 3]
    assert left["moment"]-right["moment"] == pytest.approx(6)
    assert left["shear"]-right["shear"] == pytest.approx(10)


@pytest.mark.parametrize("patch", [dict(memberId="missing"), dict(at=7), dict(at=-1), dict(at=float("nan")), dict(id="N1")])
def test_invalid_action_points_are_rejected(patch):
    data = fixture(); data["actionPoints"][0].update(patch)
    with pytest.raises((ModelError, ValidationError)):
        compute(data)


@pytest.mark.parametrize("target", [{}, dict(pointId="missing"), dict(nodeId="N1", pointId="A1")])
def test_moment_requires_exactly_one_valid_target(target):
    data = fixture(); data["moments"] = [dict(id="M1", value=10, **target)]
    with pytest.raises((ModelError, ValidationError)):
        compute(data)


def test_api_action_points_and_legacy_compatibility():
    client = TestClient(app); data = fixture()
    response = client.post('/api/solve', json=data)
    assert response.status_code == 200
    assert len(response.json()["segments"]) == 2
    data["actionPoints"][0]["at"] = 7
    assert client.post('/api/solve', json=data).status_code == 422
    del data["actionPoints"]; data["moments"] = [dict(id="M1", nodeId="N2", value=10)]
    assert client.post('/api/solve', json=data).status_code == 200
