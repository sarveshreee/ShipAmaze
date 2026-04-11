import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import PublicTracking from "@/pages/PublicTracking";
import NotFound from "@/pages/NotFound";

// Admin
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminNDR from "@/pages/admin/AdminNDR";
import AdminCatalogue from "@/pages/admin/AdminCatalogue";
import AdminRates from "@/pages/admin/AdminRates";
import AdminCouriers from "@/pages/admin/AdminCouriers";
import AdminDropshippers from "@/pages/admin/AdminDropshippers";
import AdminVendors from "@/pages/admin/AdminVendors";
import AdminFinance from "@/pages/admin/AdminFinance";
import AdminAnalytics from "@/pages/admin/AdminAnalytics";
import AdminSupport from "@/pages/admin/AdminSupport";
import AdminSettings from "@/pages/admin/AdminSettings";

// Vendor
import VendorDashboard from "@/pages/vendor/VendorDashboard";
import VendorOrders from "@/pages/vendor/VendorOrders";
import VendorTeam from "@/pages/vendor/VendorTeam";
import VendorSettings from "@/pages/vendor/VendorSettings";

// Dropshipper
import DropshipperDashboard from "@/pages/dropshipper/DropshipperDashboard";
import DropshipperOrders from "@/pages/dropshipper/DropshipperOrders";
import CreateOrder from "@/pages/dropshipper/CreateOrder";
import BulkUpload from "@/pages/dropshipper/BulkUpload";
import ChannelConnect from "@/pages/dropshipper/ChannelConnect";
import DropshipperWallet from "@/pages/dropshipper/DropshipperWallet";
import DropshipperRates from "@/pages/dropshipper/DropshipperRates";
import DropshipperSettings from "@/pages/dropshipper/DropshipperSettings";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AppRoutes() {
  const { isAuthenticated, role } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to={`/${role}`} replace /> : <LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/track" element={<PublicTracking />} />

      {/* Admin */}
      <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/orders" element={<ProtectedRoute><AdminOrders /></ProtectedRoute>} />
      <Route path="/admin/ndr" element={<ProtectedRoute><AdminNDR /></ProtectedRoute>} />
      <Route path="/admin/catalogue" element={<ProtectedRoute><AdminCatalogue /></ProtectedRoute>} />
      <Route path="/admin/rates" element={<ProtectedRoute><AdminRates /></ProtectedRoute>} />
      <Route path="/admin/couriers" element={<ProtectedRoute><AdminCouriers /></ProtectedRoute>} />
      <Route path="/admin/dropshippers" element={<ProtectedRoute><AdminDropshippers /></ProtectedRoute>} />
      <Route path="/admin/vendors" element={<ProtectedRoute><AdminVendors /></ProtectedRoute>} />
      <Route path="/admin/finance" element={<ProtectedRoute><AdminFinance /></ProtectedRoute>} />
      <Route path="/admin/analytics" element={<ProtectedRoute><AdminAnalytics /></ProtectedRoute>} />
      <Route path="/admin/support" element={<ProtectedRoute><AdminSupport /></ProtectedRoute>} />
      <Route path="/admin/settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />

      {/* Vendor */}
      <Route path="/vendor" element={<ProtectedRoute><VendorDashboard /></ProtectedRoute>} />
      <Route path="/vendor/orders" element={<ProtectedRoute><VendorOrders /></ProtectedRoute>} />
      <Route path="/vendor/team" element={<ProtectedRoute><VendorTeam /></ProtectedRoute>} />
      <Route path="/vendor/settings" element={<ProtectedRoute><VendorSettings /></ProtectedRoute>} />

      {/* Dropshipper */}
      <Route path="/dropshipper" element={<ProtectedRoute><DropshipperDashboard /></ProtectedRoute>} />
      <Route path="/dropshipper/orders" element={<ProtectedRoute><DropshipperOrders /></ProtectedRoute>} />
      <Route path="/dropshipper/create-order" element={<ProtectedRoute><CreateOrder /></ProtectedRoute>} />
      <Route path="/dropshipper/bulk-upload" element={<ProtectedRoute><BulkUpload /></ProtectedRoute>} />
      <Route path="/dropshipper/channels" element={<ProtectedRoute><ChannelConnect /></ProtectedRoute>} />
      <Route path="/dropshipper/wallet" element={<ProtectedRoute><DropshipperWallet /></ProtectedRoute>} />
      <Route path="/dropshipper/rates" element={<ProtectedRoute><DropshipperRates /></ProtectedRoute>} />
      <Route path="/dropshipper/tracking" element={<ProtectedRoute><PublicTracking /></ProtectedRoute>} />
      <Route path="/dropshipper/settings" element={<ProtectedRoute><DropshipperSettings /></ProtectedRoute>} />

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
