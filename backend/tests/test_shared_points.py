import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.models import BeamModel
from app.solver import ModelError, solve_beam


def fixture():
    return dict(schemaVersion=1, name="共用作用点", nodes=[dict(id="N1", x=0, y=0), dict(id="N2", x=6, y=0)],
                members=[dict(id="B1", start="N1", end="N2", E=210, I=8000)],
                supports=[dict(id="S1", nodeId="N1", kind="pin"), dict(id="S2", nodeId="N2", kind="roller")],
                actionPoints=[dict(id="A1", memberId="B1", at=3)],
                pointLoads=[dict(id="Px", pointId="A1", value=4, direction="x"), dict(id="Py", pointId="A1", value=10, direction="y")],
                distributedLoads=[], moments=[dict(id="M1", pointId="A1", value=6)])


def compute(data):
    return solve_beam(BeamModel.model_validate(data))


def test_shared_point_combines_horizontal_vertical_forces_and_couple_and_follows_motion():
    data = fixture(); result = compute(data)
    assert [r["vertical"] for r in result["reactions"]] == pytest.approx([6, 4])
    assert result["reactions"][0]["horizontal"] == pytest.approx(4)
    left, right = [p for p in result["samples"] if p["x"] == 3]
    assert left["moment"] == pytest.approx(18)
    assert right["moment"] == pytest.approx(12)
    assert left["shear"]-right["shear"] == pytest.approx(10)
    data["actionPoints"][0]["at"] = 2
    moved = compute(data)
    assert [r["vertical"] for r in moved["reactions"]] == pytest.approx([46/6, 14/6])
    assert moved["diagnostics"]["meshNodes"] == 3
    assert next(t for t in moved["calculation"]["terms"] if t["id"] == "Py")["x"] == 2


def test_linked_and_legacy_member_loads_are_physically_equivalent():
    data = fixture(); shared = compute(data)
    for force in data["pointLoads"]:
        del force["pointId"]; force.update(memberId="B1", at=3)
    assert compute(data) == shared


@pytest.mark.parametrize("patch", [dict(pointId="missing"), dict(pointId="A1", memberId="B1", at=3), dict(pointId=None)])
def test_invalid_force_target_is_rejected(patch):
    data = fixture(); data["pointLoads"][0].update(patch)
    with pytest.raises((ValidationError, ModelError)):
        compute(data)


def test_equilibrium_explanation_includes_actual_terms_and_udl_resultant():
    data = fixture(); data["distributedLoads"] = [dict(id="Q1", memberId="B1", start=1, end=3, value=2)]
    result = compute(data); calc = result["calculation"]
    assert calc["dofs"] == calc["constrainedDofs"]+calc["freeDofs"]
    for field in ["fx", "fy", "moment"]:
        assert sum(t[field] for t in calc["terms"]) == pytest.approx(0, abs=1e-8)
    q = next(t for t in calc["terms"] if t["id"] == "Q1")
    assert q["x"] == 2 and q["fy"] == -4 and q["moment"] == -8
    couple = next(t for t in calc["terms"] if t["id"] == "M1")
    assert couple["fx"] == couple["fy"] == 0 and couple["moment"] == 6
    for term in calc["terms"]:
        assert term["moment"] == pytest.approx((term["x"]-calc["origin"][0])*term["fy"]-(term["y"]-calc["origin"][1])*term["fx"]+term["couple"])
    assert TestClient(app).post('/api/solve', json=data).status_code == 200
