import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const style = document.createElement("style");
style.textContent = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#0b1120;color:#e2e8f0;line-height:1.6}`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
