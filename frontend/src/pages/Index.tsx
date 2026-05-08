import { Navigate } from "react-router-dom";

/** Fallback if this route is ever mounted; the app root normally redirects in `App.tsx`. */
const Index = () => <Navigate to="/login" replace />;

export default Index;
