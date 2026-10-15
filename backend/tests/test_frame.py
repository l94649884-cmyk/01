"""Analytical frame benchmarks independent of stiffness-matrix implementation."""
import math

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import BeamModel
from app.solver import ModelError, solve_beam

EA, EI = 210*100*100, 210*8000*0.01


def cantilever(x=0, y=3, direction="y", value=10, udl=False):
    length = math.hypot(x, y)
    load = dict(id="Q1" if udl else "P1", memberId="B1", value=value, direction=direction)
    if not udl:
        load["at"] = length
    return dict(schemaVersion=1, name="解析刚架算例",
                nodes=[dict(id="N1", x=0, y=0), dict(id="N2", x=x, y=y)],
                members=[dict(id="B1", start="N1", end="N2", E=210, I=8000, A=100)],
                supports=[dict(id="S1", nodeId="N1", kind="fixed")],
                pointLoads=[] if udl else [load], distributedLoads=[load] if udl else [])


def compute(data):
    return solve_beam(BeamModel.model_validate(data))


def node(result, node_id):
    return next(n for n in result["nodalDisplacements"] if n["nodeId"] == node_id)


def assert_balance(result):
    assert list(result["equilibrium"].values()) == pytest.approx([0, 0, 0], abs=1e-8)


def test_vertical_cantilever_axial_point_load():
    result = compute(cantilever())
    assert result["axis"] == "member-s"
    assert result["reactions"][0]["vertical"] == pytest.approx(10)
    assert result["reactions"][0]["horizontal"] == pytest.approx(0, abs=1e-10)
    assert result["reactions"][0]["moment"] == pytest.approx(0, abs=1e-10)
    assert node(result, "N2")["uy"] == pytest.approx(-10*3/EA)
    assert all(p["axial"] == pytest.approx(-10) for p in result["samples"])
    assert all(p["moment"] == pytest.approx(0, abs=1e-10) for p in result["samples"])
    assert all(p["displacement"] == pytest.approx(0, abs=1e-10) for p in result["samples"])
    assert_balance(result)


def test_vertical_cantilever_horizontal_point_load():
    result = compute(cantilever(direction="x", value=-10))
    reaction = result["reactions"][0]
    assert reaction["horizontal"] == pytest.approx(-10)
    assert reaction["vertical"] == pytest.approx(0, abs=1e-10)
    assert reaction["moment"] == pytest.approx(30)
    assert node(result, "N2")["ux"] == pytest.approx(10*3**3/(3*EI))
    assert node(result, "N2")["uy"] == pytest.approx(0, abs=1e-10)
    assert result["samples"][-1]["displacement"] == pytest.approx(-10*3**3/(3*EI))
    assert result["segments"][0]["M0"] == pytest.approx(-30)
    assert result["segments"][0]["V0"] == pytest.approx(10)
    assert_balance(result)


@pytest.mark.parametrize("x,y", [(3, 4), (-3, 4), (-3, -4), (3, -4)])
def test_inclined_cantilever_vertical_tip_force_in_all_quadrants(x, y):
    result = compute(cantilever(x=x, y=y))
    length, c, s = 5, x/5, y/5
    axial = -10*s*length/EA
    transverse = -10*c*length**3/(3*EI)
    assert node(result, "N2")["ux"] == pytest.approx(c*axial-s*transverse)
    assert node(result, "N2")["uy"] == pytest.approx(s*axial+c*transverse)
    assert result["reactions"][0]["moment"] == pytest.approx(10*x)
    assert result["segments"][0]["N0"] == pytest.approx(-10*s)
    assert result["segments"][0]["V0"] == pytest.approx(10*c)
    assert result["segments"][0]["M0"] == pytest.approx(-10*x)
    assert result["samples"][-1]["moment"] == pytest.approx(0, abs=1e-9)
    assert_balance(result)


@pytest.mark.parametrize("direction,value", [("y", 2), ("x", -2)])
def test_inclined_udl_uses_actual_length_and_exact_axial_bending_displacement(direction, value):
    data = cantilever(x=3, y=4, direction=direction, value=value, udl=True)
    result = compute(data)
    length, c, s = 5, 0.6, 0.8
    fx, fy = (-value, 0) if direction == "x" else (0, -value)
    qx, qy = c*fx+s*fy, -s*fx+c*fy
    tip_axial = qx*length**2/(2*EA)
    tip_transverse = qy*length**4/(8*EI)
    assert node(result, "N2")["ux"] == pytest.approx(c*tip_axial-s*tip_transverse)
    assert node(result, "N2")["uy"] == pytest.approx(s*tip_axial+c*tip_transverse)
    assert result["reactions"][0]["horizontal"] == pytest.approx(-fx*length, abs=1e-9)
    assert result["reactions"][0]["vertical"] == pytest.approx(-fy*length, abs=1e-9)
    assert result["reactions"][0]["moment"] == pytest.approx(-(1.5*fy-2*fx)*length)
    midpoint = min(result["samples"], key=lambda p: abs(p["station"]-length/2))
    distance = length/2
    mid_axial = qx*distance*(2*length-distance)/(2*EA)
    mid_transverse = qy*distance**2*(6*length**2-4*length*distance+distance**2)/(24*EI)
    assert midpoint["ux"] == pytest.approx(c*mid_axial-s*mid_transverse)
    assert midpoint["uy"] == pytest.approx(s*mid_axial+c*mid_transverse)
    assert midpoint["axial"] == pytest.approx(qx*(length-distance))
    assert_balance(result)


@pytest.mark.parametrize("direction,value", [("y", 10), ("x", -10)])
def test_l_frame_tip_forces_with_axial_and_bending_deformations(direction, value):
    H, B, P = 3, 4, 10
    data = cantilever(y=H, direction=direction, value=value)
    data["nodes"].append(dict(id="N3", x=B, y=H))
    data["members"].append(dict(id="B2", start="N2", end="N3", E=210, I=8000, A=100))
    data["pointLoads"][0].update(memberId="B2", at=B)
    result = compute(data)
    tip = node(result, "N3")
    if direction == "y":
        assert tip["uy"] == pytest.approx(-P*H/EA-P*B*B*H/EI-P*B**3/(3*EI))
        assert tip["ux"] == pytest.approx(P*B*H*H/(2*EI))
        assert result["reactions"][0]["moment"] == pytest.approx(P*B)
    else:
        assert tip["ux"] == pytest.approx(P*H**3/(3*EI)+P*B/EA)
        assert tip["uy"] == pytest.approx(-P*B*H*H/(2*EI))
        assert result["reactions"][0]["moment"] == pytest.approx(P*H)
    assert_balance(result)


def test_t_frame_branching_rigid_joints_and_symmetric_loads():
    H, B, P = 3, 4, 10
    data = cantilever(y=H)
    data["nodes"] += [dict(id="N3", x=B, y=H), dict(id="N4", x=-B, y=H)]
    data["members"] += [dict(id="B2", start="N2", end="N3"), dict(id="B3", start="N2", end="N4")]
    data["pointLoads"] = [dict(id="P1", memberId="B2", at=B, value=P), dict(id="P2", memberId="B3", at=B, value=P)]
    result = compute(data)
    assert result["reactions"][0]["vertical"] == pytest.approx(2*P)
    assert result["reactions"][0]["moment"] == pytest.approx(0, abs=1e-8)
    for node_id in ("N3", "N4"):
        assert node(result, node_id)["uy"] == pytest.approx(-2*P*H/EA-P*B**3/(3*EI))
        assert node(result, node_id)["ux"] == pytest.approx(0, abs=1e-10)
    assert_balance(result)


def test_interior_point_loads_preserve_axial_and_shear_jumps():
    data = cantilever(x=3, y=4)
    data["pointLoads"][0]["at"] = 2
    result = compute(data)
    at_load = [p for p in result["samples"] if p["station"] == 2]
    assert [p["axial"] for p in at_load] == pytest.approx([-8, 0], abs=1e-8)
    assert [p["shear"] for p in at_load] == pytest.approx([6, 0], abs=1e-8)
    assert [p["moment"] for p in at_load] == pytest.approx([0, 0], abs=1e-8)
    assert result["diagnostics"]["meshNodes"] == 3
    assert_balance(result)


def test_horizontal_reverse_geometry_retains_legacy_axis_and_declared_stations():
    data = cantilever(x=3, y=0)
    data["members"][0].update(start="N2", end="N1")
    data["pointLoads"][0]["at"] = 0
    result = compute(data)
    assert result["axis"] == "global-x"
    assert result["segments"][0]["s0"] == 3
    assert result["segments"][0]["s1"] == 0
    assert result["samples"][-1]["station"] == 0
    assert result["samples"][-1]["x"] == 3
    assert result["samples"][-1]["uy"] == pytest.approx(-10*3**3/(3*EI))


def test_reversing_inclined_member_preserves_global_solution_and_load_location():
    data = cantilever(x=3, y=4)
    data["pointLoads"][0]["at"] = 1.25
    original = compute(data)
    data["members"][0].update(start="N2", end="N1")
    data["pointLoads"][0]["at"] = 3.75
    reversed_result = compute(data)
    assert node(reversed_result, "N2")["ux"] == pytest.approx(node(original, "N2")["ux"])
    assert node(reversed_result, "N2")["uy"] == pytest.approx(node(original, "N2")["uy"])
    assert reversed_result["reactions"][0]["moment"] == pytest.approx(original["reactions"][0]["moment"])
    assert_balance(reversed_result)


@pytest.mark.parametrize("kind", ["all_rollers", "single_pin", "vertical_pin_roller"])
def test_rigid_body_mechanisms_rejected_even_without_load(kind):
    data = cantilever(x=3 if kind != "vertical_pin_roller" else 0, y=0 if kind != "vertical_pin_roller" else 3)
    data["pointLoads"] = []
    if kind == "single_pin":
        data["supports"][0]["kind"] = "pin"
    else:
        data["supports"] = [dict(id="S1", nodeId="N1", kind="roller" if kind == "all_rollers" else "pin"), dict(id="S2", nodeId="N2", kind="roller")]
    with pytest.raises(ModelError, match="约束不足"):
        compute(data)


def test_vertical_two_pin_supports_are_stable_under_transverse_force():
    data = cantilever(direction="x", value=-10)
    data["supports"] = [dict(id="S1", nodeId="N1", kind="pin"), dict(id="S2", nodeId="N2", kind="pin")]
    data["pointLoads"][0]["at"] = 1.5
    result = compute(data)
    assert [r["horizontal"] for r in result["reactions"]] == pytest.approx([-5, -5])
    assert max(abs(p["moment"]) for p in result["samples"]) == pytest.approx(7.5)
    assert_balance(result)


@pytest.mark.parametrize("case", ["crossing", "interior_node", "overlap", "coincident_nodes"])
def test_invalid_frame_topology_rejected(case):
    data = cantilever(x=3, y=3)
    if case == "crossing":
        data["nodes"] += [dict(id="N3", x=0, y=3), dict(id="N4", x=3, y=0)]
        data["members"] += [dict(id="B2", start="N3", end="N4"), dict(id="B3", start="N2", end="N3")]
        message = "相交但未连接"
    elif case == "interior_node":
        data["nodes"].append(dict(id="N3", x=1.5, y=1.5))
        message = "跨过未连接节点"
    elif case == "overlap":
        data["nodes"].append(dict(id="N3", x=1, y=1))
        data["members"].append(dict(id="B2", start="N1", end="N3"))
        message = "跨过未连接节点"
    else:
        data["nodes"].append(dict(id="N3", x=3, y=3))
        message = "节点重合"
    with pytest.raises(ModelError, match=message):
        compute(data)


def test_api_frame_result_serializes_all_new_fields_and_default_legacy_parameters():
    data = cantilever(x=3, y=4)
    del data["members"][0]["A"]
    del data["pointLoads"][0]["direction"]
    with TestClient(app) as client:
        response = client.post("/api/solve", json=data)
    assert response.status_code == 200
    result = response.json()
    assert result["axis"] == "member-s"
    assert result["segments"][0]["EA"] == EA
    assert result["segments"][0]["c"] == pytest.approx(0.6)
    assert result["segments"][0]["s"] == pytest.approx(0.8)
    assert result["reactions"][0]["horizontal"] == pytest.approx(0, abs=1e-8)
    assert_balance(result)


def test_closed_triangular_frame_is_supported_and_force_balanced():
    data = cantilever(x=3, y=0)
    data["nodes"].append(dict(id="N3", x=1.5, y=3))
    data["members"] += [dict(id="B2", start="N2", end="N3"), dict(id="B3", start="N3", end="N1")]
    data["pointLoads"][0].update(memberId="B2", at=math.hypot(1.5, 3))
    result = compute(data)
    assert result["reactions"][0]["vertical"] == pytest.approx(10)
    assert result["reactions"][0]["moment"] == pytest.approx(15)
    assert node(result, "N3")["uy"] < 0
    assert_balance(result)
