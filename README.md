# Friend Tracker

A real-time location sharing app for you and your friends. See everyone's location on a map with their name and avatar.

## Features

- Real-time location tracking
- Google authentication
- See all friends on an interactive map
- User avatars displayed as map markers
- Serverless architecture (virtually free to host)
- Mobile-friendly PWA

## Tech Stack

- **Frontend**: React + Vite
- **Map**: Leaflet + OpenStreetMap (free, no API keys needed)
- **Backend**: Firebase Realtime Database
- **Auth**: Firebase Authentication (Google Sign-In)
- **Hosting**: Firebase Hosting

## Setup Instructions

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" and follow the setup wizard
3. Once created, click on the web icon (`</>`) to register your web app

### 2. Enable Firebase Services

#### Enable Authentication:
1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Enable **Google** as a sign-in provider
3. Add your authorized domain when deploying

#### Enable Realtime Database:
1. Go to **Realtime Database** in the Firebase Console
2. Click **Create Database**
3. Start in **test mode** (we'll secure it later)
4. Note the database URL (looks like `https://your-project-id-default-rtdb.firebaseio.com`)

### 3. Configure the Project

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Get your Firebase config from Firebase Console:
   - Go to **Project Settings** (gear icon) > **General**
   - Scroll to "Your apps" and find your web app
   - Copy the config values

3. Fill in your `.env` file with the Firebase credentials:
   ```env
   VITE_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
   VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
   ```

### 4. Install and Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 5. Set Up Security (IMPORTANT!)

To restrict access to only your friends, set up Firebase Realtime Database Rules:

1. Go to Firebase Console > **Realtime Database** > **Rules**
2. Replace the rules with:

```json
{
  "rules": {
    ".read": "auth != null && root.child('whitelist').child(auth.token.email.replace('.', ',')).exists()",
    ".write": "auth != null && root.child('whitelist').child(auth.token.email.replace('.', ',')).exists()",
    "whitelist": {
      ".read": false,
      ".write": false
    }
  }
}
```

3. Click **Publish**

**Note**: Firebase keys cannot contain dots, so we replace `.` with `,` in email addresses.

### 6. Add Friends to Whitelist

1. Go to Firebase Console > **Realtime Database** > **Data**
2. Click the `+` icon to add a child node
3. Create a node called `whitelist`
4. Add children with email addresses (replace `.` with `,`):
   - Example: `yourfriend@gmail,com` with value `true`
   - Example: `you@example,com` with value `true`

Your database structure should look like:
```
- whitelist
  - yourfriend@gmail,com: true
  - you@example,com: true
```

## Deployment

### Deploy to Firebase Hosting

1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```bash
   firebase login
   ```

3. Initialize Firebase in your project:
   ```bash
   firebase init
   ```
   - Select **Hosting**
   - Choose your existing project
   - Public directory: `dist`
   - Single-page app: `Yes`
   - GitHub auto-deploy: `No`

4. Build and deploy:
   ```bash
   npm run build
   firebase deploy
   ```

5. Your app will be live at `https://your-project-id.web.app`

6. Don't forget to add this domain to your Google Auth provider in Firebase Console!

## Usage

1. Visit your deployed URL or run locally
2. Click "Sign in with Google"
3. Allow location access when prompted
4. You'll see yourself and your friends on the map!

## Cost

This setup is **virtually free** for small groups:
- Firebase Spark Plan (free tier) includes:
  - 100 concurrent connections to Realtime Database
  - 10 GB/month hosting
  - 1 GB Realtime Database storage
- OpenStreetMap is completely free

## Troubleshooting

### "Location permission denied"
Make sure you allow location access in your browser settings.

### "Failed to update location. Check Firebase permissions."
Verify your email is in the whitelist and the database rules are published.

### Map not showing
Check the browser console for errors. Make sure your `.env` file is configured correctly.

### Friends not appearing
- Confirm they're signed in with Google
- Verify their email is in the Firebase whitelist
- Check they've granted location permission

## Privacy Note

This app shares real-time location data with all whitelisted users. Only share access with people you trust. Location data is stored in Firebase and automatically updates as users move.

## License

MIT
