import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { isConfigured } from "./config";
import SetupNotice from "./components/SetupNotice";
import "./styles/style.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

if (!isConfigured) {
  // Render the notice WITHOUT importing ./sdk/entry — initialising the delivery
  // SDK with empty credentials would throw before anything painted.
  root.render(
    <React.StrictMode>
      <SetupNotice />
    </React.StrictMode>,
  );
} else {
  // Dynamic so the SDK is only initialised once config is known good.
  // Import order matters: the SDK must initialise before any component fetches.
  Promise.all([import("./sdk/entry"), import("./App")]).then(([, { default: App }]) => {
    root.render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>,
    );
  });
}
