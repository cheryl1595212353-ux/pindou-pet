import { useState } from "react";
import { RouterProvider } from "react-router-dom";

import { createAppRouter } from "./router";
import "./styles.css";

interface AppProps {
  initialPath?: string;
}

export function App({ initialPath }: AppProps) {
  const [router] = useState(() => createAppRouter(initialPath));

  return <RouterProvider router={router} />;
}

