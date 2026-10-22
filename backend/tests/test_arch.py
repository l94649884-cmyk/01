"""Independent continuous-axis energy reference for the polygonal arch approximation."""
from math import hypot, sqrt
from scipy.integrate import quad
import pytest
from app.models import BeamModel
from app.solver import solve_beam


def arch(n):
    nodes=[dict(id=f'N{i}', x=6*i/n, y=8*(i/n)*(1-i/n)) for i in range(n+1)]
    return BeamModel.model_validate(dict(schemaVersion=1,name='arch',nodes=nodes,
        members=[dict(id=f'B{i}',start=f'N{i}',end=f'N{i+1}',E=210,I=8000,A=100) for i in range(n)],
        supports=[dict(id='S0',nodeId='N0',kind='pin'),dict(id='S1',nodeId=f'N{n}',kind='pin')],
        pointLoads=[dict(id='P',memberId=f'B{n//2-1}',at=hypot(nodes[n//2]['x']-nodes[n//2-1]['x'],nodes[n//2]['y']-nodes[n//2-1]['y']),value=10)],distributedLoads=[]))


def test_two_hinged_arch_converges_to_continuous_axis_energy_solution():
    # Castigliano compatibility: integral(M*dM/dH/EI + N*dN/dH/EA) ds = 0.
    # Left half: M=5*x-H*y, N=-H*cos(theta)-5*sin(theta).
    EI,EA=16800,2100000
    def numerator(x):
        y=8*(x/6)*(1-x/6); slope=4/3-4*x/9; ds=sqrt(1+slope*slope)
        return (5*x*y/EI-5*slope/(1+slope*slope)/EA)*ds
    def denominator(x):
        y=8*(x/6)*(1-x/6); slope=4/3-4*x/9; ds=sqrt(1+slope*slope)
        return (y*y/EI+1/(1+slope*slope)/EA)*ds
    exact=quad(numerator,0,3,epsabs=1e-12)[0]/quad(denominator,0,3,epsabs=1e-12)[0]
    errors=[]
    for n in [8,16,32,64]:
        result=solve_beam(arch(n));left,right=result['reactions']
        assert left['vertical']==pytest.approx(5,abs=1e-7)
        assert right['vertical']==pytest.approx(5,abs=1e-7)
        assert right['horizontal']==pytest.approx(-left['horizontal'],abs=1e-7)
        assert abs(result['equilibrium']['force'])<1e-7
        assert abs(result['equilibrium']['moment'])<1e-7
        errors.append(abs(left['horizontal']-exact))
    assert all(b<a/3 for a,b in zip(errors,errors[1:]))
    assert errors[-1]/exact<0.001


def test_rigid_right_angle_transfers_bending_moment():
    model=BeamModel.model_validate(dict(schemaVersion=1,name='L',nodes=[dict(id='A',x=0,y=0),dict(id='B',x=0,y=3),dict(id='C',x=4,y=3)],members=[dict(id='AB',start='A',end='B',E=210,I=8000),dict(id='BC',start='B',end='C',E=210,I=8000)],supports=[dict(id='S',nodeId='A',kind='fixed')],pointLoads=[dict(id='P',memberId='BC',at=4,value=10)],distributedLoads=[]))
    result=solve_beam(model)
    assert result['reactions'][0]['moment']==pytest.approx(40)
    for member in ['AB','BC']:
        assert max(abs(p['moment']) for p in result['samples'] if p['memberId']==member)==pytest.approx(40)
