# GraduRat Mobile

This Expo Router app is the mobile client for the existing GraduRat API in
`../main`. It supports graduate and employer registration, dashboards, and
employer opportunity publishing.

## Run locally

Copy `.env.example` to `.env`, then set `EXPO_PUBLIC_API_URL` to the API
address. On a physical phone, use the computer's LAN address instead of
`localhost`.

```powershell
npm start
```

The API remains responsible for Supabase and Groq secrets. Never put service
role keys or Groq keys in this project.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

## EAS

The project is connected to Expo project ID
`4a4ca617-24cf-4fc0-a765-cf3af2882b37`.

```powershell
npx eas-cli@latest init --id 4a4ca617-24cf-4fc0-a765-cf3af2882b37
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android
```
