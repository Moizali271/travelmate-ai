# TravelMate AI

TravelMate AI is an AI-powered travel planning web application that helps users plan trips, generate itineraries, explore hotels, manage bookings, and track travel expenses in one place.

## Features

- **AI Trip Planner:** Generate personalized travel itineraries using Google Gemini AI.
- **Itinerary Editor:** View, edit, and save generated travel itineraries.
- **Trip Management:** Manage saved trips.
- **Hotels:** Browse hotel listings available through the application.
- **My Bookings:** View booking details and cancel eligible booking requests.
- **Expense Tracker:** Record expenses, monitor spending, and manage travel budgets.
- **User Authentication:** Access supported features through user accounts.

## Technologies Used

- **Frontend:** React, Vite, Tailwind CSS
- **Charts:** Recharts
- **Backend:** Python, FastAPI
- **Database:** MongoDB
- **AI Integration:** Google Gemini API
- **API Communication:** REST API

## Project Structure

```text
travelmate-ai/
├── frontend/
│   └── src/
│       └── pages/
├── backend/
│   └── app/
│       ├── routers/
│       ├── main.py
│       └── db.py
└── README.md
```

## Requirements

Before running the project, install:

- Node.js and npm
- Python
- MongoDB database
- Google Gemini API key

## Installation and Setup

### 1. Clone or Open the Project

Open the project folder in Visual Studio Code.

### 2. Configure the Backend

Navigate to the backend directory:

```powershell
cd backend
```

Create a `.env` file inside the `backend` folder and configure your environment variables:

```env
MONGODB_URI=your_mongodb_connection_string
DB_NAME=travelmate
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=your_supported_gemini_model
```

Replace the placeholder values with your actual configuration. Never share your API keys publicly.

### 3. Install Backend Dependencies

If your project contains a `requirements.txt` file, run:

```powershell
pip install -r requirements.txt
```

If you already use a virtual environment named `venv`, activate it:

```powershell
.\venv\Scripts\Activate.ps1
```

### 4. Start the Backend Server

From the `backend` directory, run:

```powershell
uvicorn app.main:app --reload --port 8000
```

The backend API should be available at:

`http://localhost:8000`

Interactive API documentation:

`http://localhost:8000/docs`

### 5. Install Frontend Dependencies

Open a second terminal in VS Code and navigate to the frontend directory:

```powershell
cd frontend
npm install
```

### 6. Start the Frontend

Run:

```powershell
npm run dev
```

Open the local URL displayed in the terminal, usually:

`http://localhost:5173`

If your frontend requires a custom backend URL, configure `VITE_API_BASE_URL` in `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000
```

Restart the frontend server after changing environment variables.

## How to Use TravelMate AI

1. Create an account or log in.
2. Explore the Trips section to manage trips.
3. Use the AI Planner to generate a travel itinerary.
4. Review and save the itinerary in the Itinerary Editor.
5. Browse available hotels.
6. View and manage booking requests in My Bookings.
7. Add travel expenses and monitor the budget in Expense Tracker.

## Testing Checklist

- [ ] Sign up and log in successfully.
- [ ] Create and manage trips.
- [ ] Generate an itinerary using Gemini AI.
- [ ] Save and edit the itinerary.
- [ ] Load hotel listings.
- [ ] View booking details.
- [ ] Cancel a test booking request.
- [ ] Add expenses and verify budget calculations.
- [ ] Check the browser console and backend terminal for errors.

Use test data during testing. Avoid making real payments or cancelling real hotel reservations.

## Security

- Keep API keys and database credentials in environment variables.
- Never commit `.env` files to a public repository.
- Do not expose private API keys in frontend code.
- Configure production database access and CORS carefully before deployment.
- Verify that users can access only their own protected data.

## Deployment

Before deploying the application:

1. Choose hosting for the frontend and backend.
2. Configure a production MongoDB database.
3. Set production environment variables securely.
4. Configure the frontend to use the deployed backend URL.
5. Restrict backend CORS to trusted frontend domains.
6. Test authentication, AI integration, and database operations in production.

Deployment is not included in the local development instructions above.

## Troubleshooting

**Backend fails to start**
- Check Python dependencies and the virtual environment.
- Verify the `.env` configuration.
- Review the backend terminal error.

**MongoDB connection fails**
- Verify `MONGODB_URI`.
- Check database permissions and network access.

**AI itinerary generation fails**
- Check `AI_PROVIDER=gemini`.
- Verify the Gemini API key, model configuration, and API quota.

**Frontend cannot connect to the backend**
- Confirm the backend is running on port `8000`.
- Verify `VITE_API_BASE_URL`.

## Project Status

The main application features have been manually tested in the local development environment. Further testing is recommended after code changes and before deployment.

## Conclusion

TravelMate AI combines AI-assisted itinerary planning, trip management, hotel browsing, booking management, and expense tracking in a single travel planning application.
