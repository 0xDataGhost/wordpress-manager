import { BrowserRouter } from "react-router-dom";
import { DirectionProvider } from "@radix-ui/react-direction";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AppRoutes } from "@/routes/AppRoutes";

export default function App() {
  return (
    <DirectionProvider dir="rtl">
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </DirectionProvider>
  );
}
