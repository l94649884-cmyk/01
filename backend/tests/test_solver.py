import copy

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.models import BeamModel
from app.solver import ModelError, solve_beam


def fixture(kind="point"):
    cantilever = kind == "cantilever"
    return dict(schemaVersion=1, name=kind,
                nodes=[dict(id="N1", x=0, y=0), dict(id="N2", x=3 if cantilever else 6, y=0)],
                members=[dict(id="B1", start="N1", end="N2", E=210, I=8000)],
                supports=[dict(id="S1", nodeId="N1", kind="fixed")] if cantilever else [dict(id="S1", nodeId="N1", kind="pin"), dict(id="S2", nodeId="N2", kind="roller")],
                pointLoads=[] if kind == "udl" else [dict(id="P1", memberId="B1", at=3, value=10)],
                distributedLoads=[dict(id="Q1", memberId="B1", value=2)] if kind == "udl" else [])


def compute(data):
    return solve_beam(BeamModel.model_validate(data))


@pytest.mark.parametrize("kind,expected_reactions,expected_max_moment,expected_max_shear,expected_deflection", [
    ("point", [5, 5], 15, 5, -10*6**3/(48*16800)),
    ("udl", [6, 6], 9, 6, -5*2*6**4/(384*16800)),
    ("cantilever", [10], -30, 10, -10*3**3/(3*16800)),
])
def test_required_analytic_benchmarks(kind, expected_reactions, expected_max_moment, expected_max_shear, expected_deflection):
    result = compute(fixture(kind))
    assert [r["vertical"] for r in result["reactions"]] == pytest.approx(expected_reactions, abs=1e-9)
    assert result["extrema"]["moment"]["moment"] == pytest.approx(expected_max_moment, abs=1e-9)
    assert abs(result["extrema"]["shear"]["shear"]) == pytest.approx(expected_max_shear, abs=1e-9)
    assert result["extrema"]["displacement"]["displacement"] == pytest.approx(expected_deflection, abs=1e-10)
    assert result["reactions"][0]["moment"] == pytest.approx(30 if kind == "cantilever" else 0, abs=1e-9)
    assert result["equilibrium"]["force"] == pytest.approx(0, abs=1e-9)
    assert result["equilibrium"]["moment"] == pytest.approx(0, abs=1e-9)
    assert result["samples"][-1]["moment"] == pytest.approx(0, abs=1e-9)


def test_shear_jump_and_moment_continuity_at_point_load():
    result = compute(fixture())
    both = [p for p in result["samples"] if p["x"] == 3]
    assert [p["shear"] for p in both] == pytest.approx([5, -5])
    assert [p["moment"] for p in both] == pytest.approx([15, 15])


def test_off_center_point_load_and_non_grid_position():
    data = fixture()
    data["pointLoads"][0]["at"] = 1.234
    result = compute(data)
    assert [r["vertical"] for r in result["reactions"]] == pytest.approx([10*(6-1.234)/6, 10*1.234/6])
    assert result["extrema"]["moment"]["x"] == pytest.approx(1.234)
    assert result["extrema"]["moment"]["moment"] == pytest.approx(10*1.234*(6-1.234)/6)


def test_superposition_signed_loads_and_exact_udl_moment_extremum():
    data=fixture("udl")
    data["pointLoads"]=[dict(id="P1", memberId="B1", at=1, value=3)]
    result=compute(data)
    assert [r["vertical"] for r in result["reactions"]] == pytest.approx([8.5,6.5])
    assert result["extrema"]["moment"]["x"] == pytest.approx(2.75)
    data["pointLoads"][0]["value"]=-3
    assert sum(r["vertical"] for r in compute(data)["reactions"]) == pytest.approx(9)


def test_load_at_support_and_coincident_loads():
    data=fixture()
    data["pointLoads"]=[dict(id="P1",memberId="B1",at=0,value=4),dict(id="P2",memberId="B1",at=3,value=6),dict(id="P3",memberId="B1",at=3,value=4)]
    result=compute(data)
    assert [r["vertical"] for r in result["reactions"]] == pytest.approx([9,5])
    assert result["extrema"]["moment"]["moment"] == pytest.approx(15)


def test_two_span_continuous_beam_uniform_load():
    data=fixture("udl")
    data["nodes"].append(dict(id="N3",x=12,y=0))
    data["members"].append(dict(id="B2",start="N2",end="N3",E=210,I=8000))
    data["supports"].append(dict(id="S3",nodeId="N3",kind="roller"))
    data["distributedLoads"].append(dict(id="Q2",memberId="B2",value=2))
    result=compute(data)
    assert [r["vertical"] for r in result["reactions"]] == pytest.approx([4.5,15,4.5])
    assert [p["moment"] for p in result["samples"] if p["x"]==6] == pytest.approx([-9,-9])


def test_segmenting_beam_and_reversing_members_does_not_change_result():
    original=compute(fixture("udl"))
    data=fixture("udl")
    data["nodes"].append(dict(id="N3",x=2,y=0))
    data["members"][0]["end"]="N3"
    data["members"].append(dict(id="B2",start="N2",end="N3",E=210,I=8000))
    data["distributedLoads"].append(dict(id="Q2",memberId="B2",value=2))
    result=compute(data)
    assert [r["vertical"] for r in result["reactions"]] == pytest.approx([r["vertical"] for r in original["reactions"]])
    assert result["extrema"]["moment"]["moment"] == pytest.approx(9)


def test_reverse_member_point_distance_is_from_declared_start():
    data=fixture()
    data["members"][0].update(start="N2",end="N1")
    data["pointLoads"][0]["at"]=1
    assert [r["vertical"] for r in compute(data)["reactions"]] == pytest.approx([10/6,50/6])


def test_rigidity_changes_displacement_not_statically_determinate_forces():
    data=fixture()
    original=compute(data)
    data["members"][0]["I"]*=2
    result=compute(data)
    assert result["extrema"]["displacement"]["displacement"] == pytest.approx(original["extrema"]["displacement"]["displacement"]/2)
    assert result["extrema"]["moment"]["moment"] == pytest.approx(15)


def test_fixed_fixed_uniform_load_has_support_moments_and_exact_deflection():
    data=fixture("udl")
    for support in data["supports"]: support["kind"]="fixed"
    result=compute(data)
    assert [r["moment"] for r in result["reactions"]] == pytest.approx([6,-6])
    assert result["extrema"]["displacement"]["displacement"] == pytest.approx(-2*6**4/(384*16800))


def test_zero_load_returns_zero_solution():
    data=fixture()
    data["pointLoads"]=[]
    result=compute(data)
    assert all(abs(s["moment"])+abs(s["shear"])+abs(s["displacement"])==0 for s in result["samples"])


@pytest.mark.parametrize("corruption", ["unsupported", "bad_area", "disconnected", "duplicate", "overlap", "outside", "missing_node", "missing_member", "bad_rigidity", "nan", "short_element", "extra_field", "version", "duplicate_support"])
def test_invalid_models_rejected(corruption):
    data=fixture()
    if corruption=="unsupported": data["supports"]=[]
    elif corruption=="bad_area": data["members"][0]["A"]=0
    elif corruption=="disconnected": data["nodes"].append(dict(id="N3",x=10,y=0))
    elif corruption=="duplicate": data["nodes"][1]["id"]="N1"
    elif corruption=="overlap": data["members"].append(dict(id="B2",start="N1",end="N2",E=210,I=8000))
    elif corruption=="outside": data["pointLoads"][0]["at"]=7
    elif corruption=="missing_node": data["members"][0]["start"]="missing"
    elif corruption=="missing_member": data["pointLoads"][0]["memberId"]="missing"
    elif corruption=="bad_rigidity": data["members"][0]["I"]=-1
    elif corruption=="nan": data["nodes"][0]["x"]=float('nan')
    elif corruption=="short_element": data["pointLoads"][0]["at"]=1e-7
    elif corruption=="extra_field": data["members"][0]["release"]="hinge"
    elif corruption=="version": data["schemaVersion"]=2
    elif corruption=="duplicate_support": data["supports"][1]["nodeId"]="N1"
    with pytest.raises((ModelError,ValidationError)): compute(data)


def test_api_health_solve_validate_and_actionable_errors():
    with TestClient(app) as client:
        assert client.get('/api/health').json()["status"]=="ok"
        assert client.post('/api/solve',json=fixture()).json()["reactions"][0]["vertical"]==pytest.approx(5)
        bad=fixture();bad["supports"]=[]
        assert client.post('/api/validate',json=bad).json()["valid"] is False
        response=client.post('/api/solve',json=bad)
        assert response.status_code==422
        assert "约束不足" in response.json()["errors"][0]
        bad=fixture();bad["members"][0]["I"]=0
        response=client.post('/api/solve',json=bad)
        assert response.status_code==422
        assert response.json()["errors"]


def test_solver_does_not_mutate_input():
    data=fixture();before=copy.deepcopy(data)
    compute(data)
    assert data==before
