"""Linear 2D Euler–Bernoulli frames: ux, uy and CCW theta at each node.

Internal units: kN, m; E[GPa]*1e6, A[cm2]*1e-4, I[cm4]*1e-8.
Local x follows the member; local y is its CCW normal. N is tensile positive,
M is sagging positive, dM/ds=V, dV/ds=q, dN/ds=-qx. Horizontal collinear
models retain increasing-global-x orientation, including reversed members.
Other frames use each member's declared start-to-end orientation.
Point forces create mesh nodes. Exact UDL particular functions recover axial
and transverse displacements between nodes; plots never smooth force jumps.
"""
import warnings
from itertools import combinations

import numpy as np
from numpy.polynomial import Polynomial
from scipy.linalg import LinAlgWarning, solve

from .models import BeamModel

TOL = 1e-8


class ModelError(ValueError):
    pass


def _xy(node):
    return np.array([node.x, node.y], dtype=float)


def _cross(a, b):
    return float(a[0]*b[1] - a[1]*b[0])


def validate_model(model: BeamModel) -> list[str]:
    errors = []
    groups = (model.nodes, model.members, model.supports, model.pointLoads, model.distributedLoads, model.moments, model.actionPoints)
    ids = [item.id for group in groups for item in group]
    if len(ids) != len(set(ids)):
        errors.append("所有对象 ID 必须唯一。")
    nodes = {n.id: n for n in model.nodes}
    members = {m.id: m for m in model.members}
    if len(nodes) < 2 or not members:
        errors.append("至少需要两个节点和一根杆件。")
    if any(np.linalg.norm(_xy(a)-_xy(b)) < 1e-4 for a, b in combinations(nodes.values(), 2)):
        errors.append("节点重合或间距小于 0.0001 m，请合并节点或调整坐标。")
    adjacency = {key: set() for key in nodes}
    edges, valid_members = set(), []
    for m in model.members:
        if m.start not in nodes or m.end not in nodes:
            errors.append(f"杆件 {m.id} 引用了不存在的节点。")
            continue
        a, b = _xy(nodes[m.start]), _xy(nodes[m.end])
        length = float(np.linalg.norm(b-a))
        if length < 1e-4:
            errors.append(f"杆件 {m.id} 长度为零或小于 0.0001 m。")
            continue
        edge = frozenset((m.start, m.end))
        if edge in edges:
            errors.append(f"杆件 {m.id} 与已有杆件重复或重叠。")
        edges.add(edge)
        adjacency[m.start].add(m.end)
        adjacency[m.end].add(m.start)
        valid_members.append((m, a, b, length))
        for n in nodes.values():
            if n.id in (m.start, m.end):
                continue
            relative = _xy(n)-a
            station = float(relative @ (b-a) / length)
            if TOL < station < length-TOL and abs(_cross(relative, b-a))/length < TOL:
                errors.append(f"杆件 {m.id} 跨过未连接节点 {n.id}；请在该节点处分段连接。")
    # Collinear overlaps are covered by duplicate-edge/interior-node checks.
    for (m, a, b, length), (other, c, d, other_length) in combinations(valid_members, 2):
        if {m.start, m.end} & {other.start, other.end}:
            continue
        ab, cd = b-a, d-c
        denominator = _cross(ab, cd)
        if abs(denominator) <= TOL*length*other_length:
            continue
        t, u = _cross(c-a, cd)/denominator, _cross(c-a, ab)/denominator
        if -TOL <= t <= 1+TOL and -TOL <= u <= 1+TOL:
            errors.append(f"杆件 {m.id} 与 {other.id} 相交但未连接；请在交点创建共享节点并分段。")
    if nodes:
        visited, pending = set(), [next(iter(nodes))]
        while pending:
            current = pending.pop()
            if current not in visited:
                visited.add(current)
                pending.extend(adjacency[current]-visited)
        if len(visited) != len(nodes):
            errors.append("结构未连通或存在孤立节点；请连接全部节点与杆件。")
    support_nodes = [s.nodeId for s in model.supports]
    if len(support_nodes) != len(set(support_nodes)):
        errors.append("同一节点只能设置一个支座。")
    if any(s.nodeId not in nodes for s in model.supports):
        errors.append("支座引用了不存在的节点。")
    if any(m.nodeId is not None and m.nodeId not in nodes for m in model.moments):
        errors.append("集中弯矩引用了不存在的节点。")
    points = {p.id for p in model.actionPoints}
    if any(m.pointId is not None and m.pointId not in points for m in model.moments):
        errors.append("集中弯矩引用了不存在的作用点。")
    # Connected rigid-jointed frames have three rigid body modes. Check the
    # restraint rank before solving, including for unloaded structures.
    restraints = []
    origin = _xy(next(iter(nodes.values()))) if nodes else np.zeros(2)
    span = max([float(np.linalg.norm(_xy(n)-origin)) for n in nodes.values()] + [1.0])
    for support in model.supports:
        if support.nodeId not in nodes:
            continue
        x, y = (_xy(nodes[support.nodeId])-origin)/span
        if support.kind in ("pin", "fixed"):
            restraints.append([1, 0, -y])
        restraints.append([0, 1, x])
        if support.kind == "fixed":
            restraints.append([0, 0, 1])
    if not restraints or np.linalg.matrix_rank(np.array(restraints), tol=1e-10) < 3:
        errors.append("约束不足：支座未限制平面整体平移或转动；滚动支座仅约束全局竖向位移。")
    for load in model.pointLoads + model.distributedLoads + model.actionPoints:
        if load.memberId not in members:
            errors.append(f"荷载 {load.id} 未连接到有效杆件。")
    for load in model.pointLoads + model.actionPoints:
        m = members.get(load.memberId)
        if m and m.start in nodes and m.end in nodes:
            length = float(np.linalg.norm(_xy(nodes[m.end])-_xy(nodes[m.start])))
            if load.at > length+TOL:
                errors.append(f"作用位置 {load.id} 超出杆长 {length:g} m。")
    for load in model.distributedLoads:
        m = members.get(load.memberId)
        if m and m.start in nodes and m.end in nodes:
            length = float(np.linalg.norm(_xy(nodes[m.end])-_xy(nodes[m.start])))
            end = length if load.end is None else load.end
            if end > length+TOL or end-load.start < 1e-6:
                errors.append(f"均布荷载 {load.id} 的区间须满足 0 ≤ 起点 < 终点 ≤ 杆长 {length:g} m，且长度至少 0.000001 m。")
    return list(dict.fromkeys(errors))


def _local_stiffness(length, EA, EI):
    k = np.zeros((6, 6))
    axial, bending = [0, 3], [1, 2, 4, 5]
    k[np.ix_(axial, axial)] = EA/length*np.array([[1, -1], [-1, 1]])
    L = length
    k[np.ix_(bending, bending)] = EI/L**3*np.array([
        [12, 6*L, -12, 6*L], [6*L, 4*L*L, -6*L, 2*L*L],
        [-12, -6*L, 12, -6*L], [6*L, 2*L*L, -6*L, 4*L*L]])
    return k


def _station(value, length):
    if value < TOL:
        return 0.0
    if length-value < TOL:
        return length
    return round(value, 10)


def solve_beam(model: BeamModel) -> dict:
    errors = validate_model(model)
    if errors:
        raise ModelError("\n".join(errors))
    nodes = {n.id: n for n in model.nodes}
    horizontal = max(n.y for n in model.nodes)-min(n.y for n in model.nodes) <= TOL
    axis = "global-x" if horizontal else "member-s"
    mesh = [_xy(n) for n in model.nodes]
    node_index = {n.id: i for i, n in enumerate(model.nodes)}
    elements, point_forces, point_moments = [], [], []
    action_points = {p.id: p for p in model.actionPoints}
    ordered_members = sorted(model.members, key=lambda m: min(nodes[m.start].x, nodes[m.end].x)) if horizontal else model.members
    for member in ordered_members:
        reverse = horizontal and nodes[member.end].x < nodes[member.start].x
        first, last = (member.end, member.start) if reverse else (member.start, member.end)
        a, b = _xy(nodes[first]), _xy(nodes[last])
        length = float(np.linalg.norm(b-a))
        c, s = (b-a)/length
        rotation = np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])
        transform = np.zeros((6, 6))
        transform[:3, :3] = transform[3:, 3:] = rotation
        loads = [p for p in model.pointLoads if p.memberId == member.id]
        positions = {p.id: _station(length-p.at if reverse else p.at, length) for p in loads}
        moments = [m for m in model.moments if m.pointId is not None and action_points[m.pointId].memberId == member.id]
        moment_positions = {m.id: _station(length-action_points[m.pointId].at if reverse else action_points[m.pointId].at, length) for m in moments}
        distributed = []
        for load in model.distributedLoads:
            if load.memberId != member.id:
                continue
            end = length if load.end is None else load.end
            lo, hi = (length-end, length-load.start) if reverse else (load.start, end)
            distributed.append((load, _station(lo, length), _station(hi, length)))
        stations = sorted({0.0, length, *positions.values(), *moment_positions.values(), *(s for _, lo, hi in distributed for s in (lo, hi))})
        if any(right-left < 1e-6 for left, right in zip(stations, stations[1:])):
            raise ModelError("荷载距离节点或其他荷载过近（小于 0.000001 m），请使其重合或增大间距。")
        indices = {0.0: node_index[first], length: node_index[last]}
        for station in stations[1:-1]:
            indices[station] = len(mesh)
            mesh.append(a+(b-a)*station/length)
        for p in loads:
            point_forces.append((indices[positions[p.id]], 0 if p.direction == "x" else 1, -p.value))
        for moment in moments:
            point_moments.append((indices[moment_positions[moment.id]], moment.value))
        EA, EI = member.E*member.A*100, member.E*member.I*0.01
        for left, right in zip(stations, stations[1:]):
            global_q = np.zeros(2)
            midpoint = (left+right)/2
            for load, lo, hi in distributed:
                if lo < midpoint < hi:
                    global_q[0 if load.direction == "x" else 1] -= load.value
            qx, q = rotation[:2, :2] @ global_q
            L = right-left
            k = _local_stiffness(L, EA, EI)
            f = np.array([qx*L/2, q*L/2, q*L*L/12, qx*L/2, q*L/2, -q*L*L/12])
            dofs = np.array([3*indices[left]+i for i in range(3)]+[3*indices[right]+i for i in range(3)])
            elements.append(dict(member=member.id, left=left, right=right, length=length,
                                 reverse=reverse, EA=EA, EI=EI, qx=float(qx), q=float(q),
                                 global_q=global_q, c=float(c), s=float(s),
                                 a=mesh[indices[left]], b=mesh[indices[right]], k=k, f=f, T=transform, dofs=dofs))
    size = 3*len(mesh)
    K, F = np.zeros((size, size)), np.zeros(size)
    for e in elements:
        dofs, transform = e["dofs"], e["T"]
        K[np.ix_(dofs, dofs)] += transform.T @ e["k"] @ transform
        F[dofs] += transform.T @ e["f"]
    for index, direction, value in point_forces:
        F[3*index+direction] += value
    for moment in model.moments:
        if moment.nodeId is not None:
            F[3*node_index[moment.nodeId]+2] += moment.value
    for index, value in point_moments:
        F[3*index+2] += value
    constrained = set()
    for support in model.supports:
        i = 3*node_index[support.nodeId]
        constrained.add(i+1)
        if support.kind in ("pin", "fixed"):
            constrained.add(i)
        if support.kind == "fixed":
            constrained.add(i+2)
    free = sorted(set(range(size))-constrained)
    u, condition = np.zeros(size), 1.0
    if free:
        reduced = K[np.ix_(free, free)]
        diagonal = np.diag(reduced)
        if np.any(diagonal <= 0):
            raise ModelError("刚度矩阵存在无刚度自由度，请检查约束和杆件。")
        scale = 1/np.sqrt(diagonal)
        scaled = scale[:, None]*reduced*scale[None, :]
        condition = float(np.linalg.cond(scaled))
        if not np.isfinite(condition) or condition > 1e12:
            raise ModelError("刚度矩阵病态或约束不足，无法可靠求解；请检查杆长、刚度差异和支座。")
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", LinAlgWarning)
                u[free] = scale*solve(scaled, scale*F[free], assume_a="pos")
        except (np.linalg.LinAlgError, LinAlgWarning) as exc:
            raise ModelError("刚度矩阵无法可靠求解，请检查约束和模型尺寸。") from exc
    R = K @ u-F
    reactions = []
    for support in model.supports:
        i, n = 3*node_index[support.nodeId], nodes[support.nodeId]
        reactions.append({"supportId": support.id, "nodeId": support.nodeId, "x": n.x, "y": n.y,
                          "horizontal": float(R[i]) if support.kind in ("pin", "fixed") else 0.0,
                          "vertical": float(R[i+1]), "moment": float(R[i+2]) if support.kind == "fixed" else 0.0})
    samples, segments = [], []
    for e in elements:
        L, q, qx, EI, EA = e["right"]-e["left"], e["q"], e["qx"], e["EI"], e["EA"]
        ue = e["T"] @ u[e["dofs"]]
        end_forces = e["k"] @ ue-e["f"]
        N0, V0, M0 = float(-end_forces[0]), float(end_forces[1]), float(-end_forces[2])
        # Polynomials in normalized t=s/L with exact UDL particular terms.
        v1, theta1, v2, theta2 = ue[[1, 2, 4, 5]]
        bubble = q*L**4/(24*EI)
        transverse = Polynomial([v1, L*theta1, -3*v1-2*L*theta1+3*v2-L*theta2+bubble,
                                 2*v1+L*theta1-2*v2+L*theta2-2*bubble, bubble])
        axial_bubble = qx*L*L/(2*EA)
        axial = Polynomial([ue[0], ue[3]-ue[0]+axial_bubble, -axial_bubble])
        global_x = e["c"]*axial-e["s"]*transverse
        global_y = e["s"]*axial+e["c"]*transverse
        points = list(np.linspace(0, 1, 61))
        if abs(q) > 1e-14 and 0 < -V0/q < L:
            points.append(-V0/q/L)
        for polynomial in (transverse, global_x, global_y):
            points.extend(float(root.real) for root in polynomial.deriv().roots()
                          if abs(root.imag) < 1e-9 and 0 < root.real < 1)
        for t in sorted(set(points)):
            station = e["left"]+t*L
            declared_station = e["length"]-station if e["reverse"] else station
            samples.append({"memberId": e["member"], "station": declared_station,
                            "x": float(e["a"][0]+t*L) if horizontal else station,
                            "axial": N0-qx*t*L, "shear": V0+q*t*L,
                            "moment": M0+V0*t*L+q*(t*L)**2/2,
                            "displacement": float(transverse(t)), "ux": float(global_x(t)), "uy": float(global_y(t))})
        segments.append({"memberId": e["member"],
                         "x0": float(e["a"][0]) if horizontal else e["left"],
                         "x1": float(e["b"][0]) if horizontal else e["right"],
                         "s0": e["length"]-e["left"] if e["reverse"] else e["left"],
                         "s1": e["length"]-e["right"] if e["reverse"] else e["right"],
                         "startX": float(e["a"][0]), "startY": float(e["a"][1]),
                         "endX": float(e["b"][0]), "endY": float(e["b"][1]),
                         "N0": N0, "V0": V0, "M0": M0, "q": q, "qx": qx, "EI": EI, "EA": EA,
                         "dofs": ue[[1, 2, 4, 5]].tolist(), "axialDofs": ue[[0, 3]].tolist(), "c": e["c"], "s": e["s"]})
    # Check both force components and moment about a nearby origin.
    origin = mesh[0]
    total_x = sum(r["horizontal"] for r in reactions)
    total_y = sum(r["vertical"] for r in reactions)
    total_moment = sum((r["x"]-origin[0])*r["vertical"]-(r["y"]-origin[1])*r["horizontal"]+r["moment"] for r in reactions)
    force_scale = 1.0
    for index, direction, value in point_forces:
        force = np.zeros(2)
        force[direction] = value
        total_x += force[0]
        total_y += force[1]
        total_moment += _cross(mesh[index]-origin, force)
        force_scale += abs(value)
    for e in elements:
        force = e["global_q"]*(e["right"]-e["left"])
        total_x += force[0]
        total_y += force[1]
        total_moment += _cross((e["a"]+e["b"])/2-origin, force)
        force_scale += float(np.linalg.norm(force))
    length_scale = max(1.0, *(float(np.linalg.norm(p-origin)) for p in mesh))
    total_moment += sum(moment.value for moment in model.moments)
    force_scale += sum(abs(moment.value) for moment in model.moments)/length_scale
    if max(abs(total_x), abs(total_y)) > 1e-7*force_scale or abs(total_moment) > 1e-7*force_scale*length_scale:
        raise ModelError("求解后整体平衡残差超限，结果已拒绝输出。请检查模型的尺度和刚度。")
    notes = ["二维 Euler–Bernoulli 小变形线弹性刚架；每节点有水平、竖向、转角三个自由度。忽略剪切变形、自重与二阶效应。",
             "节点间杆件刚接；铰支座约束全局 x/y 位移，滚动支座仅约束全局 y 位移；支座不代表杆件内铰。",
             "荷载正值沿所选全局坐标轴的负方向；均布荷载按实际杆长计。集中弯矩正值逆时针，中心或左右仅为符号显示位置，均作用于所连接的点。N 拉为正；V、M 与局部横向位移 w 按杆件局部坐标定义。"]
    notes.append("水平直梁按全局 x 正方向绘图。" if horizontal else "各杆件按起点→终点的距离分别绘图；局部横向为杆轴逆时针旋转 90°，w 不一定等于全局竖向位移 uy。")
    return {"axis": axis, "reactions": reactions, "samples": samples, "segments": segments,
            "extrema": {key: max(samples, key=lambda p: abs(p[key])) for key in ("moment", "shear", "axial", "displacement", "ux", "uy")},
            "equilibrium": {"horizontal": float(total_x), "force": float(total_y), "moment": float(total_moment)},
            "diagnostics": {"meshNodes": len(mesh), "elements": len(elements), "scaledCondition": condition},
            "nodalDisplacements": [{"nodeId": n.id, "ux": float(u[3*i]), "uy": float(u[3*i+1]), "rotation": float(u[3*i+2])} for i, n in enumerate(model.nodes)],
            "notes": notes}
