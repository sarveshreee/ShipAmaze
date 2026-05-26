import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import PublicTracking from "@/pages/PublicTracking";
import PublicOrderDetail from "@/pages/PublicOrderDetail";
import NotFound from "@/pages/NotFound";
import ShopifyStore from "@/pages/ShopifyStore";
import ProductPreview from "@/pages/ProductPreview";
import { useCartSync } from "@/hooks/useCartSync";
import { useDropshipperAccess } from "@/hooks/useDropshipperAccess";

// Admin
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminNDR from "@/pages/admin/AdminNDR";
import AdminRates from "@/pages/admin/AdminRates";
import AdminCouriers from "@/pages/admin/AdminCouriers";
import AdminDropshippers from "@/pages/admin/AdminDropshippers";
import AdminVendors from "@/pages/admin/AdminVendors";
import AdminFinance from "@/pages/admin/AdminFinance";
import AdminAnalytics from "@/pages/admin/AdminAnalytics";
import AdminSupport from "@/pages/admin/AdminSupport";
import AdminCatalogue from "@/pages/admin/AdminCatalogue";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminReturns from "@/pages/admin/AdminReturns";
import AdminManifests from "@/pages/admin/AdminManifests";
import AdminBilling from "@/pages/admin/AdminBilling";
import AdminWeightDisputes from "@/pages/admin/AdminWeightDisputes";
import AdminPincode from "@/pages/admin/AdminPincode";
import AdminReports from "@/pages/admin/AdminReports";

// Vendor
import VendorDashboard from "@/pages/vendor/VendorDashboard";
import VendorOrders from "@/pages/vendor/VendorOrders";
import VendorTeam from "@/pages/vendor/VendorTeam";
import VendorSettings from "@/pages/vendor/VendorSettings";
import VendorCatalogue from "@/pages/vendor/VendorCatalogue";
import VendorPayouts from "@/pages/vendor/VendorPayouts";
import VendorWarehouse from "@/pages/vendor/VendorWarehouse";
import AdminPermissions from "@/pages/admin/AdminPermissions";

// Dropshipper
import DropshipperDashboard from "@/pages/dropshipper/DropshipperDashboard";
import DropshipperOrders from "@/pages/dropshipper/DropshipperOrders";
import CreateOrder from "@/pages/dropshipper/CreateOrder";
import AddOrder from "@/pages/dropshipper/AddOrder";
import BulkUpload from "@/pages/dropshipper/BulkUpload";
import ChannelConnect from "@/pages/dropshipper/ChannelConnect";
import DropshipperWallet from "@/pages/dropshipper/DropshipperWallet";
import DropshipperRates from "@/pages/dropshipper/DropshipperRates";
import DropshipperSettings from "@/pages/dropshipper/DropshipperSettings";
import DropshipperReturns from "@/pages/dropshipper/DropshipperReturns";
import DropshipperNDR from "@/pages/dropshipper/DropshipperNDR";
import DropshipperWeightDisputes from "@/pages/dropshipper/DropshipperWeightDisputes";
import DropshipperPickupAddresses from "@/pages/dropshipper/DropshipperPickupAddresses";
import DropshipperVendors from "@/pages/dropshipper/DropshipperVendors";
// Supplier (shared across all roles)
import SourceProduct from "@/pages/supplier/SourceProduct";
import ProductsPage from "@/pages/supplier/ProductsPage";
import VendorProducts from "@/pages/vendor/VendorProducts";
import NewProductRequest from "@/pages/supplier/NewProductRequest";
import BulkUploadProducts from "@/pages/supplier/BulkUploadProducts";
import ChangePassword from "@/pages/ChangePassword";
import ProfilePage from "@/pages/ProfilePage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import VerifyEmailPage from "@/pages/VerifyEmailPage";

// Marketplace (Home)
import MarketplaceHome from "@/pages/marketplace/MarketplaceHome";
import MarketplaceProductDetail from "@/pages/marketplace/MarketplaceProductDetail";

import type { UserRole } from "@/services/authService";
import { roleDashboardPath } from "@/services/authService";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";

function AuthLoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function RoleProtectedRoute({ children, allow }: { children: React.ReactNode; allow: UserRole[] }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <AuthLoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!user || !allow.includes(user.role)) {
    return <Navigate to={roleDashboardPath(user?.role ?? "admin")} replace />;
  }
  return <AppLayout>{children}</AppLayout>;
}

/** Blocks restricted dropshippers from operational pages (add order, bulk upload, etc.). */
function FullDropshipperRoute({ children }: { children: React.ReactNode }) {
  const { isRestricted } = useDropshipperAccess();
  if (isRestricted) return <Navigate to="/dropshipper/orders" replace />;
  return <>{children}</>;
}

function WarehouseAccessRoute({ children }: { children: React.ReactNode }) {
  const { allowWarehouseAccess } = useDropshipperAccess();
  if (!allowWarehouseAccess) return <Navigate to="/dropshipper/orders" replace />;
  return <>{children}</>;
}

function LoginGate() {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <AuthLoadingScreen />;
  if (isAuthenticated && user) return <Navigate to={roleDashboardPath(user.role)} replace />;
  return <LoginPage />;
}

function SignupGate() {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <AuthLoadingScreen />;
  if (isAuthenticated && user) return <Navigate to={roleDashboardPath(user.role)} replace />;
  return <SignupPage />;
}

function AppRoutes() {
  useCartSync();

  return (
    <RouteErrorBoundary>
    <Routes>
      <Route path="/store" element={<ShopifyStore />} />
      <Route path="/login" element={<LoginGate />} />
      <Route path="/signup" element={<SignupGate />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/track" element={<PublicTracking />} />
      <Route path="/order-detail" element={<PublicOrderDetail />} />
      <Route path="/product-preview" element={<ProductPreview />} />

      {/* Admin */}
      <Route path="/admin/dashboard" element={<RoleProtectedRoute allow={["admin"]}><AdminDashboard /></RoleProtectedRoute>} />
      <Route path="/admin/orders" element={<RoleProtectedRoute allow={["admin"]}><AdminOrders /></RoleProtectedRoute>} />
      <Route path="/admin/ndr" element={<RoleProtectedRoute allow={["admin"]}><AdminNDR /></RoleProtectedRoute>} />
      <Route path="/admin/returns" element={<RoleProtectedRoute allow={["admin"]}><AdminReturns /></RoleProtectedRoute>} />
      <Route path="/admin/manifests" element={<RoleProtectedRoute allow={["admin"]}><AdminManifests /></RoleProtectedRoute>} />
      <Route path="/admin/catalogue" element={<RoleProtectedRoute allow={["admin"]}><AdminCatalogue /></RoleProtectedRoute>} />
      <Route path="/admin/rates" element={<RoleProtectedRoute allow={["admin"]}><AdminRates /></RoleProtectedRoute>} />
      <Route path="/admin/couriers" element={<RoleProtectedRoute allow={["admin"]}><AdminCouriers /></RoleProtectedRoute>} />
      <Route path="/admin/dropshippers" element={<RoleProtectedRoute allow={["admin"]}><AdminDropshippers /></RoleProtectedRoute>} />
      <Route path="/admin/vendors" element={<RoleProtectedRoute allow={["admin"]}><AdminVendors /></RoleProtectedRoute>} />
      <Route path="/admin/pincode" element={<RoleProtectedRoute allow={["admin"]}><AdminPincode /></RoleProtectedRoute>} />
      <Route path="/admin/finance" element={<RoleProtectedRoute allow={["admin"]}><AdminFinance /></RoleProtectedRoute>} />
      <Route path="/admin/billing" element={<RoleProtectedRoute allow={["admin"]}><AdminBilling /></RoleProtectedRoute>} />
      <Route path="/admin/weight-disputes" element={<RoleProtectedRoute allow={["admin"]}><AdminWeightDisputes /></RoleProtectedRoute>} />
      <Route path="/admin/analytics" element={<RoleProtectedRoute allow={["admin"]}><AdminAnalytics /></RoleProtectedRoute>} />
      <Route path="/admin/reports" element={<RoleProtectedRoute allow={["admin"]}><AdminReports /></RoleProtectedRoute>} />
      <Route path="/admin/support" element={<RoleProtectedRoute allow={["admin"]}><AdminSupport /></RoleProtectedRoute>} />
      <Route path="/admin/settings" element={<RoleProtectedRoute allow={["admin"]}><AdminSettings /></RoleProtectedRoute>} />
      <Route path="/admin/permissions" element={<RoleProtectedRoute allow={["admin"]}><AdminPermissions /></RoleProtectedRoute>} />
      <Route path="/admin/profile" element={<RoleProtectedRoute allow={["admin"]}><ProfilePage /></RoleProtectedRoute>} />
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

      {/* Vendor */}
      <Route path="/vendor/dashboard" element={<RoleProtectedRoute allow={["vendor"]}><VendorDashboard /></RoleProtectedRoute>} />
      <Route path="/vendor/orders" element={<RoleProtectedRoute allow={["vendor"]}><VendorOrders /></RoleProtectedRoute>} />
      <Route path="/vendor/catalogue" element={<RoleProtectedRoute allow={["vendor"]}><VendorCatalogue /></RoleProtectedRoute>} />
      <Route path="/vendor/team" element={<RoleProtectedRoute allow={["vendor"]}><VendorTeam /></RoleProtectedRoute>} />
      <Route path="/vendor/settings" element={<RoleProtectedRoute allow={["vendor"]}><VendorSettings /></RoleProtectedRoute>} />
      <Route path="/vendor/payouts" element={<RoleProtectedRoute allow={["vendor"]}><VendorPayouts /></RoleProtectedRoute>} />
      <Route path="/vendor/warehouse" element={<RoleProtectedRoute allow={["vendor"]}><VendorWarehouse /></RoleProtectedRoute>} />
      <Route path="/vendor/profile" element={<RoleProtectedRoute allow={["vendor"]}><ProfilePage /></RoleProtectedRoute>} />
      <Route path="/vendor" element={<Navigate to="/vendor/dashboard" replace />} />

      {/* Dropshipper */}
      <Route path="/dropshipper/dashboard" element={<RoleProtectedRoute allow={["dropshipper"]}><DropshipperDashboard /></RoleProtectedRoute>} />
      <Route path="/dropshipper/orders" element={<RoleProtectedRoute allow={["dropshipper"]}><DropshipperOrders /></RoleProtectedRoute>} />
      <Route path="/dropshipper/create-order" element={<RoleProtectedRoute allow={["dropshipper"]}><FullDropshipperRoute><CreateOrder /></FullDropshipperRoute></RoleProtectedRoute>} />
      <Route path="/dropshipper/add-order" element={<RoleProtectedRoute allow={["dropshipper"]}><FullDropshipperRoute><AddOrder /></FullDropshipperRoute></RoleProtectedRoute>} />
      <Route path="/dropshipper/bulk-upload" element={<RoleProtectedRoute allow={["dropshipper"]}><FullDropshipperRoute><BulkUpload /></FullDropshipperRoute></RoleProtectedRoute>} />
      <Route path="/dropshipper/channels" element={<RoleProtectedRoute allow={["dropshipper"]}><ChannelConnect /></RoleProtectedRoute>} />
      <Route path="/dropshipper/vendors" element={<RoleProtectedRoute allow={["dropshipper"]}><WarehouseAccessRoute><DropshipperVendors /></WarehouseAccessRoute></RoleProtectedRoute>} />
      <Route path="/dropshipper/warehouses" element={<RoleProtectedRoute allow={["dropshipper"]}><WarehouseAccessRoute><VendorWarehouse /></WarehouseAccessRoute></RoleProtectedRoute>} />
      <Route path="/dropshipper/wallet" element={<RoleProtectedRoute allow={["dropshipper"]}><DropshipperWallet /></RoleProtectedRoute>} />
      <Route path="/vendor/wallet" element={<RoleProtectedRoute allow={["vendor"]}><DropshipperWallet /></RoleProtectedRoute>} />
      <Route path="/dropshipper/rates" element={<RoleProtectedRoute allow={["dropshipper"]}><DropshipperRates /></RoleProtectedRoute>} />
      <Route path="/dropshipper/returns" element={<RoleProtectedRoute allow={["dropshipper"]}><DropshipperReturns /></RoleProtectedRoute>} />
      <Route path="/dropshipper/ndr" element={<RoleProtectedRoute allow={["dropshipper"]}><DropshipperNDR /></RoleProtectedRoute>} />
      <Route path="/dropshipper/weight-disputes" element={<RoleProtectedRoute allow={["dropshipper"]}><DropshipperWeightDisputes /></RoleProtectedRoute>} />
      <Route path="/dropshipper/addresses" element={<Navigate to="/dropshipper/pickup-addresses" replace />} />
      <Route
        path="/dropshipper/pickup-addresses"
        element={
          <RoleProtectedRoute allow={["dropshipper"]}>
            <DropshipperPickupAddresses />
          </RoleProtectedRoute>
        }
      />
      <Route path="/dropshipper/tracking" element={<RoleProtectedRoute allow={["dropshipper"]}><PublicTracking /></RoleProtectedRoute>} />
      <Route path="/dropshipper/settings" element={<RoleProtectedRoute allow={["dropshipper"]}><DropshipperSettings /></RoleProtectedRoute>} />
      <Route path="/dropshipper/profile" element={<RoleProtectedRoute allow={["dropshipper"]}><ProfilePage /></RoleProtectedRoute>} />
      <Route path="/dropshipper" element={<Navigate to="/dropshipper/dashboard" replace />} />

      {/* Supplier Product module — available in all role areas */}
      {(["admin","vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-supplier`} path={`/${r}/source-product`} element={<RoleProtectedRoute allow={[r]}><SourceProduct /></RoleProtectedRoute>} />
      ))}
      {/* Vendor uses dedicated table-based My Products view */}
      <Route path="/vendor/products" element={<RoleProtectedRoute allow={["vendor"]}><VendorProducts /></RoleProtectedRoute>} />
      {(["admin","dropshipper"] as const).map(r => (
        <Route key={`${r}-products`} path={`/${r}/products`} element={<RoleProtectedRoute allow={[r]}><ProductsPage /></RoleProtectedRoute>} />
      ))}
      {(["admin","vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-requests`} path={`/${r}/product-requests`} element={<RoleProtectedRoute allow={[r]}><NewProductRequest /></RoleProtectedRoute>} />
      ))}
      {(["admin","vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-bulk-products`} path={`/${r}/bulk-upload-products`} element={<RoleProtectedRoute allow={[r]}><BulkUploadProducts /></RoleProtectedRoute>} />
      ))}

      {/* Marketplace Home — available across roles */}
      {(["admin","vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-home`} path={`/${r}/home`} element={<RoleProtectedRoute allow={[r]}><MarketplaceHome /></RoleProtectedRoute>} />
      ))}
      {(["admin","vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-home-pdp`} path={`/${r}/home/product/:id`} element={<RoleProtectedRoute allow={[r]}><MarketplaceProductDetail /></RoleProtectedRoute>} />
      ))}

      {(["admin","vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-change-password`} path={`/${r}/change-password`} element={<RoleProtectedRoute allow={[r]}><ChangePassword /></RoleProtectedRoute>} />
      ))}

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </RouteErrorBoundary>
  );
}

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <ThemeProvider>
        <BrandingProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrandingProvider>
      </ThemeProvider>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
