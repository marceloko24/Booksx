// Entry for the static demo build (single HTML page, no server).
import { createRoot } from "react-dom/client";
import { App } from "@/components/App";

createRoot(document.getElementById("root")!).render(<App />);
