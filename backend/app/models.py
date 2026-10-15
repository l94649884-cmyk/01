from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


Id = Annotated[str, Field(min_length=1, max_length=80)]


class Node(StrictModel):
    id: Id
    x: float = Field(ge=-1000, le=1000)
    y: float = Field(default=0, ge=-1000, le=1000)


class Member(StrictModel):
    id: Id
    start: Id
    end: Id
    E: float = Field(default=210, ge=1e-6, le=10000, description="GPa")
    I: float = Field(default=8000, ge=1e-6, le=1e10, description="cm^4")
    A: float = Field(default=100, ge=1e-6, le=1e8, description="cm^2")


class Support(StrictModel):
    id: Id
    nodeId: Id
    kind: Literal["pin", "roller", "fixed"]


class PointLoad(StrictModel):
    id: Id
    memberId: Id
    at: float = Field(ge=0, le=3000, description="m from member start along actual member length")
    value: float = Field(ge=-1e6, le=1e6, description="kN; positive acts along the negative global axis")
    direction: Literal["x", "y"] = "y"


class DistributedLoad(StrictModel):
    id: Id
    memberId: Id
    value: float = Field(ge=-1e6, le=1e6, description="kN/m of actual member length; positive acts along the negative global axis")
    direction: Literal["x", "y"] = "y"
    start: float = Field(default=0, ge=0, le=3000, description="m from declared member start")
    end: float | None = Field(default=None, ge=0, le=3000, description="m from declared member start; omitted means member end")


class ActionPoint(StrictModel):
    id: Id
    memberId: Id
    at: float = Field(ge=0, le=3000, description="m from declared member start")


class NodalMoment(StrictModel):
    id: Id
    nodeId: Id | None = None
    pointId: Id | None = None
    value: float = Field(ge=-1e6, le=1e6, description="kN*m; positive counterclockwise")
    side: Literal["left", "center", "right"] = "right"

    @model_validator(mode="after")
    def one_target(self):
        if (self.nodeId is None) == (self.pointId is None):
            raise ValueError("集中弯矩必须且只能连接一个作用点或节点。")
        return self


class BeamModel(StrictModel):
    schemaVersion: Literal[1] = 1
    name: str = Field(default="未命名梁", max_length=120)
    nodes: list[Node] = Field(max_length=80)
    members: list[Member] = Field(max_length=79)
    supports: list[Support] = Field(max_length=80)
    pointLoads: list[PointLoad] = Field(max_length=100)
    distributedLoads: list[DistributedLoad] = Field(max_length=100)
    moments: list[NodalMoment] = Field(default_factory=list, max_length=100)
    actionPoints: list[ActionPoint] = Field(default_factory=list, max_length=100)
