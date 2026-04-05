import Home from "./pages/Home";
import Services from "./pages/Services";
import Gallery from "./pages/Gallery";
import Booking from "./pages/Booking";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

export const routers = [
    { path: "/", name: "home", element: <Home /> },
    { path: "/services", name: "services", element: <Services /> },
    { path: "/gallery", name: "gallery", element: <Gallery /> },
    { path: "/booking", name: "booking", element: <Booking /> },
    { path: "/about", name: "about", element: <About /> },
    { path: "/contact", name: "contact", element: <Contact /> },
    { path: "/login", name: "login", element: <Login /> },
    /* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */
    { path: "*", name: "404", element: <NotFound /> },
];

declare global {
    interface Window {
        __routers__: typeof routers;
    }
}
window.__routers__ = routers;
