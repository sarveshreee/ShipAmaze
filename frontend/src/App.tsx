import { lazy, Suspense } from "react";
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
import { useStaffPermissions, type StaffPermission } from "@/hooks/useStaffPermissions";
import { AccessDenied } from "@/components/AccessDenied";
import AdminChannels from "@/pages/admin/AdminChannels";
import AdminKyc from "@/pages/admin/AdminKyc";
import AdminCategories from "@/pages/admin/AdminCategories";

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
import AdminApprovals from "@/pages/admin/AdminApprovals";
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
import AdminReturns from "@/pages/admin/AdminReturns";
import AdminManifests from "@/pages/admin/AdminManifests";
import AdminBilling from "@/pages/admin/AdminBilling";
import AdminWeightDisputes from "@/pages/admin/AdminWeightDisputes";
import AdminPincode from "@/pages/admin/AdminPincode";
const AdminReports = lazy(() => import("@/pages/admin/AdminReports"));

// Vendor
import VendorDashboard from "@/pages/vendor/VendorDashboard";
import VendorOrders from "@/pages/vendor/VendorOrders";
import VendorTeam from "@/pages/vendor/VendorTeam";
import VendorSettings from "@/pages/vendor/VendorSettings";
import VendorCatalogue from "@/pages/vendor/VendorCatalogue";
import VendorPayouts from "@/pages/vendor/VendorPayouts";
import VendorWarehouse from "@/pages/vendor/VendorWarehouse";
import AdminPermissions from "@/pages/admin/AdminPermissions";
import AdminUsers from "@/pages/admin/AdminUsers";

// Dropshipper
import DropshipperDashboard from "@/pages/dropshipper/DropshipperDashboard";
import DropshipperOrders from "@/pages/dropshipper/DropshipperOrders";
import CreateOrder from "@/pages/dropshipper/CreateOrder";
import AddOrder from "@/pages/dropshipper/AddOrder";
const BulkUpload = lazy(() => import("@/pages/dropshipper/BulkUpload"));
import ChannelConnect from "@/pages/dropshipper/ChannelConnect";
import DropshipperWallet from "@/pages/dropshipper/DropshipperWallet";
import DropshipperRates from "@/pages/dropshipper/DropshipperRates";
import DropshipperCatalog from "@/pages/dropshipper/DropshipperCatalog";
import DropshipperSettings from "@/pages/dropshipper/DropshipperSettings";
import DropshipperReturns from "@/pages/dropshipper/DropshipperReturns";
import DropshipperNDR from "@/pages/dropshipper/DropshipperNDR";
import DropshipperWeightDisputes from "@/pages/dropshipper/DropshipperWeightDisputes";
import DropshipperPickupAddresses from "@/pages/dropshipper/DropshipperPickupAddresses";
import DropshipperVendors from "@/pages/dropshipper/DropshipperVendors";
// Supplier (shared across all roles)
const SourceProduct = lazy(() => import("@/pages/supplier/SourceProduct"));
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
import { ShipAmazeLogo } from "@/components/brand/ShipAmazeLogo";

function AuthLoadingScreen() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-background">
      <ShipAmazeLogo placement="loading" />
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

/** Blocks pending-KYC dropshippers from marketplace, channels, and order creation. */
function KycApprovedDropshipperRoute({ children }: { children: React.ReactNode }) {
  const { isKycPending } = useDropshipperAccess();
  if (isKycPending) {
    return (
      <AccessDenied
        message="Complete KYC and wait for admin approval before using marketplace or connecting channels."
        actionLabel="Go to KYC Settings"
        actionPath="/dropshipper/settings"
      />
    );
  }
  return <>{children}</>;
}

/** Blocks restricted / pending-KYC dropshippers from operational pages. */
function FullDropshipperRoute({ children }: { children: React.ReactNode }) {
  const { isRestricted, isKycPending } = useDropshipperAccess();
  if (isKycPending) {
    return (
      <AccessDenied
        message="Complete KYC and wait for admin approval before creating orders or connecting channels."
        actionLabel="Go to KYC Settings"
        actionPath="/dropshipper/settings"
      />
    );
  }
  if (isRestricted) return <Navigate to="/dropshipper/orders" replace />;
  return <>{children}</>;
}

function WarehouseAccessRoute({ children }: { children: React.ReactNode }) {
  const { allowWarehouseAccess } = useDropshipperAccess();
  if (!allowWarehouseAccess) return <Navigate to="/dropshipper/orders" replace />;
  return <>{children}</>;
}

/** Owner admin or staff with granted operational permission(s). */
function AdminStaffRoute({
  children,
  permission,
  ownerOnly,
}: {
  children: React.ReactNode;
  permission?: StaffPermission | StaffPermission[];
  ownerOnly?: boolean;
}) {
  const { isOwnerAdmin, hasAny } = useStaffPermissions();
  if (ownerOnly && !isOwnerAdmin) return <AccessDenied message="This area is restricted to the platform owner." />;
  if (permission) {
    const perms = Array.isArray(permission) ? permission : [permission];
    if (!isOwnerAdmin && !hasAny(perms)) {
      return <AccessDenied />;
    }
  }
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
      <Route path="/admin/dashboard" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute permission={["orders.view", "analytics.view", "products.view"]}><AdminDashboard /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/orders" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute permission="orders.view"><AdminOrders /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/add-order" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute permission="orders.create"><AddOrder /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/ndr" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute permission="ndr.view"><AdminNDR /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/returns" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute permission="returns.view"><AdminReturns /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/manifests" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminManifests /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/catalogue" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute permission="products.view"><AdminCatalogue /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/approvals" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminApprovals /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/kyc" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminKyc /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/categories" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminCategories /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/rates" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminRates /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/couriers" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminCouriers /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/dropshippers" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminDropshippers /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/vendors" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminVendors /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/pincode" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminPincode /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/finance" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminFinance /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/billing" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminBilling /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/weight-disputes" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminWeightDisputes /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/analytics" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute permission="analytics.view"><AdminAnalytics /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/reports" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminReports /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/support" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminSupport /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/settings" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminSettings /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/channels" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute permission="channels.view"><AdminChannels /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/permissions" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminPermissions /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/users" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminUsers /></AdminStaffRoute></RoleProtectedRoute>} />
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
      <Route path="/dropshipper/channels" element={<RoleProtectedRoute allow={["dropshipper"]}><KycApprovedDropshipperRoute><ChannelConnect /></KycApprovedDropshipperRoute></RoleProtectedRoute>} />
      <Route path="/dropshipper/vendors" element={<RoleProtectedRoute allow={["dropshipper"]}><WarehouseAccessRoute><DropshipperVendors /></WarehouseAccessRoute></RoleProtectedRoute>} />
      <Route path="/dropshipper/warehouses" element={<RoleProtectedRoute allow={["dropshipper"]}><WarehouseAccessRoute><VendorWarehouse /></WarehouseAccessRoute></RoleProtectedRoute>} />
      <Route path="/dropshipper/wallet" element={<RoleProtectedRoute allow={["dropshipper"]}><DropshipperWallet /></RoleProtectedRoute>} />
      <Route path="/dropshipper/payouts" element={<RoleProtectedRoute allow={["dropshipper"]}><VendorPayouts /></RoleProtectedRoute>} />
      <Route path="/vendor/wallet" element={<RoleProtectedRoute allow={["vendor"]}><DropshipperWallet /></RoleProtectedRoute>} />
      <Route path="/dropshipper/rates" element={<RoleProtectedRoute allow={["dropshipper"]}><DropshipperRates /></RoleProtectedRoute>} />
      <Route path="/dropshipper/catalog" element={<RoleProtectedRoute allow={["dropshipper"]}><KycApprovedDropshipperRoute><DropshipperCatalog /></KycApprovedDropshipperRoute></RoleProtectedRoute>} />
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

      {/* Supplier Product module */}
      <Route path="/admin/source-product" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute permission={["products.create", "products.edit"]}><SourceProduct /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/products" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute permission="products.view"><ProductsPage /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/bulk-upload-products" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute permission="products.import"><BulkUploadProducts /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/product-requests" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute permission="products.view"><NewProductRequest /></AdminStaffRoute></RoleProtectedRoute>} />
      {(["vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-supplier`} path={`/${r}/source-product`} element={<RoleProtectedRoute allow={[r]}><SourceProduct /></RoleProtectedRoute>} />
      ))}
      <Route path="/vendor/products" element={<RoleProtectedRoute allow={["vendor"]}><VendorProducts /></RoleProtectedRoute>} />
      <Route path="/dropshipper/products" element={<RoleProtectedRoute allow={["dropshipper"]}><ProductsPage /></RoleProtectedRoute>} />
      {(["vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-requests`} path={`/${r}/product-requests`} element={<RoleProtectedRoute allow={[r]}><NewProductRequest /></RoleProtectedRoute>} />
      ))}
      {(["vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-bulk-products`} path={`/${r}/bulk-upload-products`} element={<RoleProtectedRoute allow={[r]}><BulkUploadProducts /></RoleProtectedRoute>} />
      ))}

      {/* Marketplace Home — available across roles */}
      <Route path="/admin/home" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute permission="products.view"><MarketplaceHome /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/home/product/:id" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute permission="products.view"><MarketplaceProductDetail /></AdminStaffRoute></RoleProtectedRoute>} />
      {(["vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-home`} path={`/${r}/home`} element={<RoleProtectedRoute allow={[r]}>{r === "dropshipper" ? <KycApprovedDropshipperRoute><MarketplaceHome /></KycApprovedDropshipperRoute> : <MarketplaceHome />}</RoleProtectedRoute>} />
      ))}
      {(["vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-home-pdp`} path={`/${r}/home/product/:id`} element={<RoleProtectedRoute allow={[r]}>{r === "dropshipper" ? <KycApprovedDropshipperRoute><MarketplaceProductDetail /></KycApprovedDropshipperRoute> : <MarketplaceProductDetail />}</RoleProtectedRoute>} />
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

function LazyFallback() {
  return <AuthLoadingScreen />;
}

const App = () => (
  <TooltipProvider>
    <Toaster />
    <BrowserRouter>
      <ThemeProvider>
        <Sonner />
        <BrandingProvider>
          <AuthProvider>
            <Suspense fallback={<LazyFallback />}>
              <AppRoutes />
            </Suspense>
          </AuthProvider>
        </BrandingProvider>
      </ThemeProvider>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
