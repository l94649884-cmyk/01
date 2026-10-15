"""Partial UDL benchmarks: statics and independent virtual-work integrals."""
import math
import pytest
from app.models import BeamModel
from app.solver import ModelError, solve_beam
from test_frame import cantilever, compute, EA, EI

@pytest.mark.parametrize('x,y,direction', [(6,0,'y'),(0,6,'x'),(3,4,'x'),(3,4,'y')])
def test_partial_cantilever_load_force_moment_and_exact_tip_displacement(x,y,direction):
    data=cantilever(x=x,y=y,direction=direction,value=2,udl=True)
    a,b=1.,3.
    data['distributedLoads'][0].update(start=a,end=b)
    r=compute(data)
    L=math.hypot(x,y);c,s=x/L,y/L
    fx,fy=(-2.,0.) if direction=='x' else (0.,-2.)
    qx,q=c*fx+s*fy,-s*fx+c*fy
    axial=qx*(b*b-a*a)/(2*EA)
    # Unit tip force virtual work: integral q*t^2*(3L-t)/(6EI) dt.
    w=q*(L*(b**3-a**3)-(b**4-a**4)/4)/(6*EI)
    tip=r['nodalDisplacements'][-1]
    assert tip['ux']==pytest.approx(c*axial-s*w,abs=1e-10)
    assert tip['uy']==pytest.approx(s*axial+c*w,abs=1e-10)
    reaction=r['reactions'][0]
    assert reaction['horizontal']==pytest.approx(-fx*(b-a),abs=1e-9)
    assert reaction['vertical']==pytest.approx(-fy*(b-a),abs=1e-9)
    assert reaction['moment']==pytest.approx(-(c*fy-s*fx)*(b*b-a*a)/2,abs=1e-9)
    assert [e['q'] for e in r['segments']]==pytest.approx([0,q,0],abs=1e-9)
    assert all(abs(v)<1e-8 for v in r['equilibrium'].values())

@pytest.mark.parametrize('reverse',[False,True])
def test_partial_simple_beam_reactions_and_peak_moment(reverse):
    data=cantilever(x=6,y=0,value=2,udl=True)
    data['supports']=[dict(id='S1',nodeId='N1',kind='pin'),dict(id='S2',nodeId='N2',kind='roller')]
    data['distributedLoads'][0].update(start=1,end=3)
    if reverse:
        data['members'][0].update(start='N2',end='N1')
        data['distributedLoads'][0].update(start=3,end=5)
    r=compute(data)
    assert [v['vertical'] for v in r['reactions']]==pytest.approx([8/3,4/3])
    assert r['extrema']['moment']['x']==pytest.approx(7/3)
    assert r['extrema']['moment']['moment']==pytest.approx(40/9)

@pytest.mark.parametrize('start,end',[(2,2),(3,2),(0,7),(6,None)])
def test_invalid_intervals_rejected(start,end):
    data=cantilever(x=6,y=0,udl=True)
    data['distributedLoads'][0].update(start=start,end=end)
    with pytest.raises(ModelError,match='区间'):
        compute(data)

def test_overlapping_ranges_superpose_and_default_remains_full_span():
    data=cantilever(x=6,y=0,value=2,udl=True)
    whole=compute(data)
    data['distributedLoads'][0].update(start=0,end=6)
    assert compute(data)['nodalDisplacements']==whole['nodalDisplacements']
    data['distributedLoads']=[dict(id='Q1',memberId='B1',value=2,start=0,end=4),dict(id='Q2',memberId='B1',value=-1,start=2,end=6)]
    result=compute(data)
    assert [s['q'] for s in result['segments']]==pytest.approx([-2,-1,1])
    assert result['reactions'][0]['vertical']==pytest.approx(4)
    assert result['reactions'][0]['moment']==pytest.approx(0,abs=1e-8)
