import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import AppLayout from "@/components/AppLayout";
import { useCartSync } from "@/hooks/useCartSync";
import { useDropshipperAccess } from "@/hooks/useDropshipperAccess";
import { useStaffPermissions, type StaffPermission } from "@/hooks/useStaffPermissions";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const SignupPage = lazy(() => import("@/pages/SignupPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPasswordPage"));
const VerifyEmailPage = lazy(() => import("@/pages/VerifyEmailPage"));
const ChangePassword = lazy(() => import("@/pages/ChangePassword"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const PublicTracking = lazy(() => import("@/pages/PublicTracking"));
const PublicOrderDetail = lazy(() => import("@/pages/PublicOrderDetail"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const ShopifyStore = lazy(() => import("@/pages/ShopifyStore"));
const ProductPreview = lazy(() => import("@/pages/ProductPreview"));

// Admin
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminOrders = lazy(() => import("@/pages/admin/AdminOrders"));
const AdminNDR = lazy(() => import("@/pages/admin/AdminNDR"));
const AdminRates = lazy(() => import("@/pages/admin/AdminRates"));
const AdminCouriers = lazy(() => import("@/pages/admin/AdminCouriers"));
const AdminDropshippers = lazy(() => import("@/pages/admin/AdminDropshippers"));
const AdminVendors = lazy(() => import("@/pages/admin/AdminVendors"));
const AdminFinance = lazy(() => import("@/pages/admin/AdminFinance"));
const AdminAnalytics = lazy(() => import("@/pages/admin/AdminAnalytics"));
const AdminSupport = lazy(() => import("@/pages/admin/AdminSupport"));
const AdminCatalogue = lazy(() => import("@/pages/admin/AdminCatalogue"));
const AdminApprovals = lazy(() => import("@/pages/admin/AdminApprovals"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const AdminReturns = lazy(() => import("@/pages/admin/AdminReturns"));
const AdminManifests = lazy(() => import("@/pages/admin/AdminManifests"));
const AdminBilling = lazy(() => import("@/pages/admin/AdminBilling"));
const AdminWeightDisputes = lazy(() => import("@/pages/admin/AdminWeightDisputes"));
const AdminPincode = lazy(() => import("@/pages/admin/AdminPincode"));
const AdminPickupAddresses = lazy(() => import("@/pages/admin/AdminPickupAddresses"));
const AdminReports = lazy(() => import("@/pages/admin/AdminReports"));
const AdminChannels = lazy(() => import("@/pages/admin/AdminChannels"));
const AdminKyc = lazy(() => import("@/pages/admin/AdminKyc"));
const AdminCategories = lazy(() => import("@/pages/admin/AdminCategories"));
const AdminPermissions = lazy(() => import("@/pages/admin/AdminPermissions"));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));

// Vendor
const VendorDashboard = lazy(() => import("@/pages/vendor/VendorDashboard"));
const VendorOrders = lazy(() => import("@/pages/vendor/VendorOrders"));
const VendorTeam = lazy(() => import("@/pages/vendor/VendorTeam"));
const VendorSettings = lazy(() => import("@/pages/vendor/VendorSettings"));
const VendorCatalogue = lazy(() => import("@/pages/vendor/VendorCatalogue"));
const VendorPayouts = lazy(() => import("@/pages/vendor/VendorPayouts"));
const VendorWarehouse = lazy(() => import("@/pages/vendor/VendorWarehouse"));
const VendorProducts = lazy(() => import("@/pages/vendor/VendorProducts"));

// Dropshipper
const DropshipperDashboard = lazy(() => import("@/pages/dropshipper/DropshipperDashboard"));
const DropshipperOrders = lazy(() => import("@/pages/dropshipper/DropshipperOrders"));
const CreateOrder = lazy(() => import("@/pages/dropshipper/CreateOrder"));
const AddOrder = lazy(() => import("@/pages/dropshipper/AddOrder"));
const BulkUpload = lazy(() => import("@/pages/dropshipper/BulkUpload"));
const ChannelConnect = lazy(() => import("@/pages/dropshipper/ChannelConnect"));
const DropshipperWallet = lazy(() => import("@/pages/dropshipper/DropshipperWallet"));
const DropshipperRates = lazy(() => import("@/pages/dropshipper/DropshipperRates"));
const DropshipperCatalog = lazy(() => import("@/pages/dropshipper/DropshipperCatalog"));
const DropshipperSettings = lazy(() => import("@/pages/dropshipper/DropshipperSettings"));
const DropshipperReturns = lazy(() => import("@/pages/dropshipper/DropshipperReturns"));
const DropshipperNDR = lazy(() => import("@/pages/dropshipper/DropshipperNDR"));
const DropshipperWeightDisputes = lazy(() => import("@/pages/dropshipper/DropshipperWeightDisputes"));
const DropshipperPickupAddresses = lazy(() => import("@/pages/dropshipper/DropshipperPickupAddresses"));
const DropshipperVendors = lazy(() => import("@/pages/dropshipper/DropshipperVendors"));
// Supplier (shared across all roles)
const SourceProduct = lazy(() => import("@/pages/supplier/SourceProduct"));
const ProductsPage = lazy(() => import("@/pages/supplier/ProductsPage"));
const NewProductRequest = lazy(() => import("@/pages/supplier/NewProductRequest"));
const BulkUploadProducts = lazy(() => import("@/pages/supplier/BulkUploadProducts"));

// Marketplace (Home)
const MarketplaceHome = lazy(() => import("@/pages/marketplace/MarketplaceHome"));
const MarketplaceProductDetail = lazy(() => import("@/pages/marketplace/MarketplaceProductDetail"));

import type { UserRole } from "@/services/authService";
import { roleDashboardPath } from "@/services/authService";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { ShipAmazeLogo } from "@/components/brand/ShipAmazeLogo";
import { AccessDenied } from "@/components/AccessDenied";

function AuthLoadingScreen() {
  return (
    <div className="relative flex h-screen flex-col items-center justify-center gap-10 overflow-hidden bg-gradient-to-b from-background via-background to-primary/[0.06]">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 40%, hsl(24 95% 53% / 0.12), transparent 70%)",
        }}
      />
      <div className="relative animate-fade-in-up">
        <ShipAmazeLogo placement="loading" />
      </div>
      <div className="relative flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary/15 border-t-primary shadow-[0_0_20px_hsl(24_95%_53%/0.25)]" />
        <p className="text-sm font-medium tracking-wide text-muted-foreground">Loading your workspace…</p>
      </div>
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

/** Blocks RESTRICTED dropshippers from add-order / bulk-upload (not KYC). */
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
      <Route path="/admin/pickup-addresses" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute ownerOnly><AdminPickupAddresses /></AdminStaffRoute></RoleProtectedRoute>} />
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
      <Route path="/dropshipper/channels" element={<RoleProtectedRoute allow={["dropshipper"]}><ChannelConnect /></RoleProtectedRoute>} />
      <Route path="/dropshipper/vendors" element={<RoleProtectedRoute allow={["dropshipper"]}><WarehouseAccessRoute><DropshipperVendors /></WarehouseAccessRoute></RoleProtectedRoute>} />
      <Route path="/dropshipper/warehouses" element={<RoleProtectedRoute allow={["dropshipper"]}><WarehouseAccessRoute><VendorWarehouse /></WarehouseAccessRoute></RoleProtectedRoute>} />
      <Route path="/dropshipper/wallet" element={<RoleProtectedRoute allow={["dropshipper"]}><DropshipperWallet /></RoleProtectedRoute>} />
      <Route path="/dropshipper/payouts" element={<RoleProtectedRoute allow={["dropshipper"]}><VendorPayouts /></RoleProtectedRoute>} />
      <Route path="/vendor/wallet" element={<RoleProtectedRoute allow={["vendor"]}><DropshipperWallet /></RoleProtectedRoute>} />
      <Route path="/dropshipper/rates" element={<RoleProtectedRoute allow={["dropshipper"]}><DropshipperRates /></RoleProtectedRoute>} />
      <Route path="/dropshipper/catalog" element={<RoleProtectedRoute allow={["dropshipper"]}><DropshipperCatalog /></RoleProtectedRoute>} />
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
      <Route path="/vendor/requested-products" element={<RoleProtectedRoute allow={["vendor"]}><NewProductRequest /></RoleProtectedRoute>} />
      <Route path="/vendor/product-requests" element={<Navigate to="/vendor/requested-products" replace />} />
      {(["vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-bulk-products`} path={`/${r}/bulk-upload-products`} element={<RoleProtectedRoute allow={[r]}><BulkUploadProducts /></RoleProtectedRoute>} />
      ))}

      {/* Marketplace Home — available across roles */}
      <Route path="/admin/home" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute permission="products.view"><MarketplaceHome /></AdminStaffRoute></RoleProtectedRoute>} />
      <Route path="/admin/home/product/:id" element={<RoleProtectedRoute allow={["admin"]}><AdminStaffRoute permission="products.view"><MarketplaceProductDetail /></AdminStaffRoute></RoleProtectedRoute>} />
      {(["vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-home`} path={`/${r}/home`} element={<RoleProtectedRoute allow={[r]}><MarketplaceHome /></RoleProtectedRoute>} />
      ))}
      {(["vendor","dropshipper"] as const).map(r => (
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
