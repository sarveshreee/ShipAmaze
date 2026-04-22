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

// Supplier (shared across all roles)
import SourceProduct from "@/pages/supplier/SourceProduct";
import ProductsPage from "@/pages/supplier/ProductsPage";
import NewProductRequest from "@/pages/supplier/NewProductRequest";
import BulkUploadProducts from "@/pages/supplier/BulkUploadProducts";

// Marketplace (Home)
import MarketplaceHome from "@/pages/marketplace/MarketplaceHome";
import MarketplaceProductDetail from "@/pages/marketplace/MarketplaceProductDetail";



function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="flex h-screen items-center justify-center bg-background"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AppRoutes() {
  const { isAuthenticated, role } = useAuth();
  useCartSync();

  return (
    <Routes>
      <Route path="/store" element={<ShopifyStore />} />
      <Route path="/login" element={isAuthenticated ? <Navigate to={role === "dropshipper" ? "/dropshipper/home" : `/${role}`} replace /> : <LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/track" element={<PublicTracking />} />
      <Route path="/order-detail" element={<PublicOrderDetail />} />
      <Route path="/product-preview" element={<ProductPreview />} />

      {/* Admin */}
      <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/orders" element={<ProtectedRoute><AdminOrders /></ProtectedRoute>} />
      <Route path="/admin/ndr" element={<ProtectedRoute><AdminNDR /></ProtectedRoute>} />
      <Route path="/admin/returns" element={<ProtectedRoute><AdminReturns /></ProtectedRoute>} />
      <Route path="/admin/manifests" element={<ProtectedRoute><AdminManifests /></ProtectedRoute>} />
      <Route path="/admin/catalogue" element={<ProtectedRoute><AdminCatalogue /></ProtectedRoute>} />
      <Route path="/admin/rates" element={<ProtectedRoute><AdminRates /></ProtectedRoute>} />
      <Route path="/admin/couriers" element={<ProtectedRoute><AdminCouriers /></ProtectedRoute>} />
      <Route path="/admin/dropshippers" element={<ProtectedRoute><AdminDropshippers /></ProtectedRoute>} />
      <Route path="/admin/vendors" element={<ProtectedRoute><AdminVendors /></ProtectedRoute>} />
      <Route path="/admin/pincode" element={<ProtectedRoute><AdminPincode /></ProtectedRoute>} />
      <Route path="/admin/finance" element={<ProtectedRoute><AdminFinance /></ProtectedRoute>} />
      <Route path="/admin/billing" element={<ProtectedRoute><AdminBilling /></ProtectedRoute>} />
      <Route path="/admin/weight-disputes" element={<ProtectedRoute><AdminWeightDisputes /></ProtectedRoute>} />
      <Route path="/admin/analytics" element={<ProtectedRoute><AdminAnalytics /></ProtectedRoute>} />
      <Route path="/admin/reports" element={<ProtectedRoute><AdminReports /></ProtectedRoute>} />
      <Route path="/admin/support" element={<ProtectedRoute><AdminSupport /></ProtectedRoute>} />
      <Route path="/admin/settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
      <Route path="/admin/permissions" element={<ProtectedRoute><AdminPermissions /></ProtectedRoute>} />

      {/* Vendor */}
      <Route path="/vendor" element={<ProtectedRoute><VendorDashboard /></ProtectedRoute>} />
      <Route path="/vendor/orders" element={<ProtectedRoute><VendorOrders /></ProtectedRoute>} />
      <Route path="/vendor/catalogue" element={<ProtectedRoute><VendorCatalogue /></ProtectedRoute>} />
      <Route path="/vendor/team" element={<ProtectedRoute><VendorTeam /></ProtectedRoute>} />
      <Route path="/vendor/settings" element={<ProtectedRoute><VendorSettings /></ProtectedRoute>} />
      <Route path="/vendor/payouts" element={<ProtectedRoute><VendorPayouts /></ProtectedRoute>} />

      {/* Dropshipper */}
      <Route path="/dropshipper" element={<ProtectedRoute><DropshipperDashboard /></ProtectedRoute>} />
      <Route path="/dropshipper/orders" element={<ProtectedRoute><DropshipperOrders /></ProtectedRoute>} />
      <Route path="/dropshipper/create-order" element={<ProtectedRoute><CreateOrder /></ProtectedRoute>} />
      <Route path="/dropshipper/add-order" element={<ProtectedRoute><AddOrder /></ProtectedRoute>} />
      <Route path="/dropshipper/bulk-upload" element={<ProtectedRoute><BulkUpload /></ProtectedRoute>} />
      <Route path="/dropshipper/channels" element={<ProtectedRoute><ChannelConnect /></ProtectedRoute>} />
      <Route path="/dropshipper/wallet" element={<ProtectedRoute><DropshipperWallet /></ProtectedRoute>} />
      <Route path="/dropshipper/rates" element={<ProtectedRoute><DropshipperRates /></ProtectedRoute>} />
      <Route path="/dropshipper/returns" element={<ProtectedRoute><DropshipperReturns /></ProtectedRoute>} />
      <Route path="/dropshipper/ndr" element={<ProtectedRoute><DropshipperNDR /></ProtectedRoute>} />
      <Route path="/dropshipper/weight-disputes" element={<ProtectedRoute><DropshipperWeightDisputes /></ProtectedRoute>} />
      <Route path="/dropshipper/addresses" element={<ProtectedRoute><DropshipperPickupAddresses /></ProtectedRoute>} />
      <Route path="/dropshipper/tracking" element={<ProtectedRoute><PublicTracking /></ProtectedRoute>} />
      <Route path="/dropshipper/settings" element={<ProtectedRoute><DropshipperSettings /></ProtectedRoute>} />

      {/* Supplier Product module — available in all role areas */}
      {(["admin","vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-supplier`} path={`/${r}/source-product`} element={<ProtectedRoute><SourceProduct /></ProtectedRoute>} />
      ))}
      {(["admin","vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-products`} path={`/${r}/products`} element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
      ))}
      {(["admin","vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-requests`} path={`/${r}/product-requests`} element={<ProtectedRoute><NewProductRequest /></ProtectedRoute>} />
      ))}
      {(["admin","vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-bulk-products`} path={`/${r}/bulk-upload-products`} element={<ProtectedRoute><BulkUploadProducts /></ProtectedRoute>} />
      ))}

      {/* Marketplace Home — available across roles */}
      {(["admin","vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-home`} path={`/${r}/home`} element={<ProtectedRoute><MarketplaceHome /></ProtectedRoute>} />
      ))}
      {(["admin","vendor","dropshipper"] as const).map(r => (
        <Route key={`${r}-home-pdp`} path={`/${r}/home/product/:id`} element={<ProtectedRoute><MarketplaceProductDetail /></ProtectedRoute>} />
      ))}

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
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
