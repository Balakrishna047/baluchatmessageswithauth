Here is a **step-by-step documentation** of the Google Cloud setup process I implemented for your **baluchat-app** OAuth integration. You can copy and share this with your team or use it for future reference.

***

### Step-by-Step Google Cloud Setup for Baluchat App

#### 1. **Login and Create Google Cloud Project**
   - Go to: [Google Cloud Console](https://console.cloud.google.com/)
   - Click the project selector (top bar), then “New Project”.
   - **Project name:** `baluchat-app`
   - Submit and wait for the new project to be created.

#### 2. **Enable Required APIs**
   - In the left sidebar, navigate to **APIs & Services > Library**.
   - Search for and enable the following APIs:
     - **Google+ API**
     - **People API**

#### 3. **Configure OAuth Consent Screen**
   - Go to **APIs & Services > OAuth consent screen**.
   - Choose **External** (for public apps) or **Internal** as per your use case.
   - Fill in the required details:
     - **App name:** `Baluchat`
     - **User support email:** `balakrishna3m9@gmail.com`
     - **Developer contact email:** `balakrishna3m9@gmail.com`
   - Save and continue. Fill any additional mandatory details if prompted (e.g., logo, domain verification for production apps).

#### 4. **Create OAuth 2.0 Credentials**
   - Go to **APIs & Services > Credentials**.
   - Click **Create Credentials > OAuth Client ID**.
   - **Application type:** Web application
   - **Name of client:** `Baluchat Web Client`
   - **Authorized redirect URIs:** Add the following:
     - `https://baluchatmessages.onrender.com`
     - `https://baluchatmessages.onrender.com/chat`
     - `https://baluchatmessages.onrender.com/auth/callback`
     - `http://localhost:3000`
     - `http://localhost:3000/chat`
   - Save. The page will now display your **client ID** and **client secret** for use in your application.

#### 5. **Integration Check**
   - Return to the **Credentials** page to verify your new OAuth 2.0 Client (should be named `Baluchat Web Client` with all required redirect URIs listed).
   - Use the provided **client ID** and **client secret** in your web app’s OAuth integration/config.

***

**Result:** The Google Cloud setup for OAuth on your `baluchat-app` project is complete and ready for Google sign-in or People API integration.

Let me know if you need screenshots or have other configuration steps to include!

[1](https://console.cloud.google.com/auth/clients/415703043165-ghs5lc7jgctdlppnr8nratir1h0i4fr4.apps.googleusercontent.com?project=baluchat-app)