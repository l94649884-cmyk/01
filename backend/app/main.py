from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .models import BeamModel
from .solver import ModelError, solve_beam, validate_model

app = FastAPI(title="力构 Lab · 二维梁与刚架分析 API", version="0.6.0")


@app.exception_handler(RequestValidationError)
async def invalid_request(_: Request, exc: RequestValidationError):
    errors = [f"{'.'.join(map(str, err['loc'][1:]))}: {err['msg']}" for err in exc.errors()]
    return JSONResponse(status_code=422, content={"errors": errors})


@app.exception_handler(ModelError)
async def invalid_model(_: Request, exc: ModelError):
    return JSONResponse(status_code=422, content={"errors": str(exc).splitlines()})


@app.get("/api/health")
def health():
    return {"status": "ok", "solver": "2D Euler–Bernoulli frame", "version": "0.6.0"}


@app.post("/api/validate")
def validate(model: BeamModel):
    errors = validate_model(model)
    return {"valid": not errors, "errors": errors}


@app.post("/api/solve")
def solve_model(model: BeamModel):
    return jsonable_encoder(solve_beam(model))


dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")





