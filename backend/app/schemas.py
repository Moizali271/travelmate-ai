import re
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

Status = Literal["planned", "ongoing", "completed"]
Mode = Literal["driving", "walking", "cycling"]
Category = Literal[
    "accommodation", "food", "transport", "activities", "shopping", "other"
]

MAX_MONEY = 1_000_000_000
MAX_TRIP_DAYS = 365


def _clean_required(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Yeh field khali nahi ho sakti")
    return value


class TripCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    destination: str = Field(min_length=1, max_length=100)
    startDate: date
    endDate: date
    budget: float = Field(ge=0, le=MAX_MONEY)
    currency: str = Field(default="PKR", min_length=3, max_length=10)
    travelerCount: int = Field(default=1, ge=1, le=100)
    status: Status = "planned"

    @field_validator("title", "destination")
    @classmethod
    def clean_text(cls, value):
        return _clean_required(value)

    @field_validator("currency")
    @classmethod
    def upper_currency(cls, value):
        return value.strip().upper()

    @model_validator(mode="after")
    def check_dates(self):
        if self.startDate < date.today():
            raise ValueError("startDate guzri hui nahi ho sakti")
        if self.endDate < self.startDate:
            raise ValueError("endDate, startDate se pehle nahi ho sakti")
        if (self.endDate - self.startDate).days + 1 > MAX_TRIP_DAYS:
            raise ValueError(f"Trip {MAX_TRIP_DAYS} dinon se lambi nahi ho sakti")
        return self


class TripUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=100)
    destination: Optional[str] = Field(default=None, min_length=1, max_length=100)
    startDate: Optional[date] = None
    endDate: Optional[date] = None
    budget: Optional[float] = Field(default=None, ge=0, le=MAX_MONEY)
    currency: Optional[str] = Field(default=None, min_length=3, max_length=10)
    travelerCount: Optional[int] = Field(default=None, ge=1, le=100)
    status: Optional[Status] = None

    @field_validator("title", "destination")
    @classmethod
    def clean_text(cls, value):
        return _clean_required(value) if value is not None else value

    @field_validator("currency")
    @classmethod
    def upper_currency(cls, value):
        return value.strip().upper() if value is not None else value

    @model_validator(mode="after")
    def check_dates(self):
        # sirf tab jab dono dates saath aayein; ek date ka check router mein hota hai
        if self.startDate and self.endDate:
            if self.endDate < self.startDate:
                raise ValueError("endDate, startDate se pehle nahi ho sakti")
            if (self.endDate - self.startDate).days + 1 > MAX_TRIP_DAYS:
                raise ValueError(
                    f"Trip {MAX_TRIP_DAYS} dinon se lambi nahi ho sakti"
                )
        return self


class StopCreate(BaseModel):
    placeId: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    category: str = Field(default="", max_length=100)
    photoUrl: Optional[str] = Field(default=None, max_length=1000)
    wikiUrl: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        return _clean_required(value)

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
    tripId: Optional[str] = Field(default=None, max_length=50)
    start: RoutePoint
    end: RoutePoint
    mode: Mode = "driving"
    distanceMeters: float = Field(ge=0, le=50_000_000)
    durationSeconds: float = Field(ge=0, le=31_536_000)
    geometry: list[list[float]] = Field(max_length=50000)  # [[lat, lon], ...]

    @field_validator("geometry")
    @classmethod
    def valid_points(cls, value):
        for point in value:
            if len(point) != 2:
                raise ValueError("Har point [lat, lon] hona chahiye")
            lat, lon = point
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise ValueError("Route ke points ki coordinates sahi nahi hain")
        return value


class BookingCreate(BaseModel):
    tripId: Optional[str] = Field(default=None, max_length=50)
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
    pricePerNight: Optional[float] = Field(default=None, ge=0, le=10_000_000)
    currency: str = Field(default="PKR", min_length=3, max_length=10)

    @field_validator("hotelName", "destination")
    @classmethod
    def clean_text(cls, value):
        return _clean_required(value)

    @field_validator("guestName")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Naam kam az kam 2 harf ka hona chahiye")
        return value

    @field_validator("currency")
    @classmethod
    def upper_currency(cls, value):
        return value.strip().upper()

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
    amount: float = Field(gt=0, le=MAX_MONEY)
    expenseDate: date
    notes: str = Field(default="", max_length=300)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value):
        return _clean_required(value)

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value):
        return value.strip()


class ExpenseUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=100)
    category: Optional[Category] = None
    amount: Optional[float] = Field(default=None, gt=0, le=MAX_MONEY)
    expenseDate: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=300)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value):
        return _clean_required(value) if value is not None else value

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value):
        return value.strip() if value is not None else value