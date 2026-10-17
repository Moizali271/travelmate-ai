import re
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

Status = Literal["planned", "ongoing", "completed"]
Mode = Literal["driving", "walking", "cycling"]
Category = Literal[
    "accommodation", "food", "transport", "activities", "shopping", "other"
]


class TripCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    destination: str = Field(min_length=1, max_length=100)
    startDate: date
    endDate: date
    budget: float = Field(ge=0)
    currency: str = "PKR"
    travelerCount: int = Field(default=1, ge=1)
    status: Status = "planned"

    @model_validator(mode="after")
    def check_dates(self):
        if self.startDate < date.today():
            raise ValueError("startDate guzri hui nahi ho sakti")
        if self.endDate < self.startDate:
            raise ValueError("endDate, startDate se pehle nahi ho sakti")
        return self


class TripUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=100)
    destination: Optional[str] = Field(default=None, min_length=1, max_length=100)
    startDate: Optional[date] = None
    endDate: Optional[date] = None
    budget: Optional[float] = Field(default=None, ge=0)
    currency: Optional[str] = None
    travelerCount: Optional[int] = Field(default=None, ge=1)
    status: Optional[Status] = None


class StopCreate(BaseModel):
    placeId: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    category: str = Field(default="", max_length=100)
    photoUrl: Optional[str] = Field(default=None, max_length=1000)
    wikiUrl: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("photoUrl", "wikiUrl")
    @classmethod
    def only_http_urls(cls, value):
        if value is not None and not value.startswith(("http://", "https://")):
            raise ValueError("URL http ya https se shuru hona chahiye")
        return value


class RoutePoint(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class RouteCalculate(BaseModel):
    start: RoutePoint
    end: RoutePoint
    mode: Mode = "driving"


class RouteSave(BaseModel):
    tripId: Optional[str] = None
    start: RoutePoint
    end: RoutePoint
    mode: Mode = "driving"
    distanceMeters: float = Field(ge=0)
    durationSeconds: float = Field(ge=0)
    geometry: list[list[float]] = Field(max_length=50000)  # [[lat, lon], ...]


class BookingCreate(BaseModel):
    tripId: Optional[str] = None
    hotelId: str = Field(min_length=1, max_length=100)
    hotelName: str = Field(min_length=1, max_length=200)
    hotelType: str = Field(default="hotel", max_length=50)
    stars: Optional[int] = Field(default=None, ge=1, le=5)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    address: str = Field(default="", max_length=300)
    destination: str = Field(min_length=1, max_length=100)
    checkIn: date
    checkOut: date
    guests: int = Field(default=1, ge=1, le=10)
    rooms: int = Field(default=1, ge=1, le=5)
    guestName: str = Field(min_length=2, max_length=100)
    phone: str = Field(min_length=7, max_length=20)
    notes: str = Field(default="", max_length=500)
    pricePerNight: Optional[float] = Field(default=None, ge=0)
    currency: str = Field(default="PKR", max_length=10)

    @field_validator("guestName")
    @classmethod
    def clean_name(cls, value):
        return value.strip()

    @field_validator("phone")
    @classmethod
    def valid_phone(cls, value):
        value = value.strip()
        if not re.fullmatch(r"[0-9+\-\s()]{7,20}", value):
            raise ValueError("Phone number sahi nahi hai")
        return value

    @model_validator(mode="after")
    def check_dates(self):
        if self.checkIn < date.today():
            raise ValueError("checkIn guzri hui nahi ho sakti")
        if self.checkOut <= self.checkIn:
            raise ValueError("checkOut, checkIn ke baad honi chahiye")
        if (self.checkOut - self.checkIn).days > 30:
            raise ValueError("Zyada se zyada 30 raatein")
        return self


class BookingConfirm(BaseModel):
    confirmationNumber: str = Field(default="", max_length=50)


class ExpenseCreate(BaseModel):
    tripId: Optional[str] = Field(default=None, max_length=50)
    title: str = Field(min_length=1, max_length=100)
    category: Category = "other"
    amount: float = Field(gt=0, le=1_000_000_000)
    expenseDate: date
    notes: str = Field(default="", max_length=300)

    @field_validator("title", "notes")
    @classmethod
    def strip_text(cls, value):
        return value.strip()


class ExpenseUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=100)
    category: Optional[Category] = None
    amount: Optional[float] = Field(default=None, gt=0, le=1_000_000_000)
    expenseDate: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=300)