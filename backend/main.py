from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import json
import os
from datetime import datetime, timedelta
import uuid

app = FastAPI(title="Career Roadmap API", version="1.0.0")

# Allow frontend (file:// or localhost) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
    return response

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)


# =============================================
# HELPERS
# =============================================

def get_user_dir(user_id: str) -> str:
    path = os.path.join(DATA_DIR, user_id)
    os.makedirs(path, exist_ok=True)
    return path

def read_json(filepath: str, default=None):
    if os.path.exists(filepath):
        with open(filepath, "r") as f:
            return json.load(f)
    return default if default is not None else {}

def write_json(filepath: str, data):
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)


# =============================================
# MODELS
# =============================================

class TestScorePayload(BaseModel):
    user_id: str
    course_id: str
    module_index: int
    score: int  # 0-100

class ScheduleEntry(BaseModel):
    module_index: int
    title: str
    level: str
    weeks: int
    start_date: str   # ISO date string
    end_date: str
    status: str       # on-track | review | revisit | upcoming
    status_label: str
    pace: str
    skills: List[str]

class SchedulePayload(BaseModel):
    user_id: str
    course_id: str
    schedule: List[ScheduleEntry]

class ProfilePayload(BaseModel):
    user_id: str
    name: Optional[str] = None
    email: Optional[str] = None
    career_goal: Optional[str] = None


# =============================================
# ROOT
# =============================================

@app.get("/api")
def root():
    return {"message": "Career Roadmap API is running 🚀", "version": "1.0.0"}


# =============================================
# TEST SCORES
# =============================================

@app.post("/api/test/save")
def save_test_score(payload: TestScorePayload):
    """Save a module test score for a user and course."""
    user_dir = get_user_dir(payload.user_id)
    filepath = os.path.join(user_dir, "test_scores.json")
    scores = read_json(filepath, {})

    if payload.course_id not in scores:
        scores[payload.course_id] = {}

    scores[payload.course_id][str(payload.module_index)] = payload.score
    write_json(filepath, scores)

    return {
        "success": True,
        "user_id": payload.user_id,
        "course_id": payload.course_id,
        "module_index": payload.module_index,
        "score": payload.score,
        "saved_at": datetime.utcnow().isoformat()
    }


@app.get("/api/test/{user_id}/{course_id}")
def get_test_scores(user_id: str, course_id: str):
    """Retrieve all test scores for a user+course combo."""
    user_dir = get_user_dir(user_id)
    filepath = os.path.join(user_dir, "test_scores.json")
    all_scores = read_json(filepath, {})
    course_scores = all_scores.get(course_id, {})
    # Convert keys to integers for frontend convenience
    return {
        "user_id": user_id,
        "course_id": course_id,
        "scores": {int(k): v for k, v in course_scores.items()}
    }


# =============================================
# SCHEDULE
# =============================================

@app.post("/api/schedule/save")
def save_schedule(payload: SchedulePayload):
    """Save the AI-generated adaptive schedule for a user+course."""
    user_dir = get_user_dir(payload.user_id)
    filepath = os.path.join(user_dir, "schedules.json")
    schedules = read_json(filepath, {})

    schedules[payload.course_id] = [entry.dict() for entry in payload.schedule]
    write_json(filepath, schedules)

    return {
        "success": True,
        "user_id": payload.user_id,
        "course_id": payload.course_id,
        "modules_scheduled": len(payload.schedule),
        "saved_at": datetime.utcnow().isoformat()
    }


@app.get("/api/schedule/{user_id}/{course_id}")
def get_schedule(user_id: str, course_id: str):
    """Retrieve the saved adaptive schedule for a user+course."""
    user_dir = get_user_dir(user_id)
    filepath = os.path.join(user_dir, "schedules.json")
    schedules = read_json(filepath, {})
    schedule = schedules.get(course_id, [])
    return {
        "user_id": user_id,
        "course_id": course_id,
        "schedule": schedule
    }


# =============================================
# PROFILE & PROGRESS
# =============================================

@app.post("/api/user/profile")
def save_profile(payload: ProfilePayload):
    """Save or update user profile data."""
    user_dir = get_user_dir(payload.user_id)
    filepath = os.path.join(user_dir, "profile.json")
    profile = read_json(filepath, {})
    if payload.name:
        profile["name"] = payload.name
    if payload.email:
        profile["email"] = payload.email
    if payload.career_goal:
        profile["career_goal"] = payload.career_goal
    profile["updated_at"] = datetime.utcnow().isoformat()
    write_json(filepath, profile)
    return {"success": True, "profile": profile}


@app.get("/api/user/{user_id}/profile")
def get_profile(user_id: str):
    user_dir = get_user_dir(user_id)
    filepath = os.path.join(user_dir, "profile.json")
    return read_json(filepath, {"user_id": user_id})


@app.get("/api/user/{user_id}/progress")
def get_user_progress(user_id: str):
    """Full progress summary: all scores, all schedules, profile."""
    user_dir = get_user_dir(user_id)

    scores = read_json(os.path.join(user_dir, "test_scores.json"), {})
    schedules = read_json(os.path.join(user_dir, "schedules.json"), {})
    profile = read_json(os.path.join(user_dir, "profile.json"), {})

    # Compute stats
    total_tests = sum(len(v) for v in scores.values())
    total_courses_started = len(scores)
    avg_score = 0
    all_scores_flat = [s for course in scores.values() for s in course.values()]
    if all_scores_flat:
        avg_score = round(sum(all_scores_flat) / len(all_scores_flat))

    return {
        "user_id": user_id,
        "profile": profile,
        "stats": {
            "total_tests_taken": total_tests,
            "courses_started": total_courses_started,
            "average_score": avg_score,
            "member_level": "Senior" if total_tests > 10 else "Intermediate" if total_tests > 5 else "Junior"
        },
        "scores": scores,
        "schedules": schedules
    }


# =============================================
# CLEAR / RESET (for dev/testing)
# =============================================

@app.delete("/api/user/{user_id}/reset")
def reset_user_data(user_id: str):
    """Clear all data for a user (dev only)."""
    user_dir = get_user_dir(user_id)
    for fname in ["test_scores.json", "schedules.json", "profile.json"]:
        fpath = os.path.join(user_dir, fname)
        if os.path.exists(fpath):
            os.remove(fpath)
    return {"success": True, "message": f"All data for {user_id} cleared."}

# =============================================
# FRONTEND SERVING (MUST BE AT THE END)
# =============================================
FRONTEND_DIR = os.path.dirname(os.path.dirname(__file__))
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")
