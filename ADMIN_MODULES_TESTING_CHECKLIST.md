# Admin modules — testing checklist

Use this after deploying or before a release to validate admin workflows, APIs, and UX. Sign in as an **admin** unless noted.

## Authentication and security

- [ ] Non-admin token cannot call `GET /api/admin/catalogue/products` (expect 403).
- [ ] Non-admin cannot call `PATCH /api/admin/vendors/:id` or `PATCH /api/admin/dropshippers/:id`.
- [ ] Non-admin cannot list or modify `GET/PATCH /api/admin/support/tickets`.
- [ ] Vendor/dropshipper cannot update or delete another account’s product via `PUT/DELETE /api/products/:id` (expect 403).
- [ ] Support ticket assignee PATCH only accepts **admin** user IDs.
- [ ] Vendor team invites (`/api/account/team`) never create users with role `admin`.

## Admin catalogue

- [ ] `Admin → Catalogue` loads paginated products without errors.
- [ ] Search matches product name, SKU, and vendor name (server-side).
- [ ] Filters: category, vendor, status (active/inactive/draft/pending_review/rejected), stock (in stock / low / out of stock), created date range.
- [ ] Sort: newest, oldest, name A–Z / Z–A.
- [ ] Row **View** opens detail sheet with vendor ownership and actions.
- [ ] Approve / deactivate / pending review / reject updates status and refreshes list.
- [ ] Bulk actions (multi-select) update counts and statuses correctly.
- [ ] Pagination: next/previous works when `total > limit`.

## Vendor management

- [ ] List shows wallet balance, order/shipment counts, Shopify connection flag.
- [ ] Search by company, name, email, phone.
- [ ] Filters: account active/inactive, blocked / not blocked, warehouse Active/Inactive, onboarding filter.
- [ ] **Manage** opens sheet with user + warehouse + Shopify summary.
- [ ] Activate / deactivate / block account persists and reflects in list badges.
- [ ] Warehouse active/inactive toggles persist.

## Dropshipper management

- [ ] List uses live wallet balance and computed order/shipment counts (not static wallet `0`).
- [ ] Search and account/blocked filters work together.
- [ ] **View** shows profile, wallet, order/shipment stats, Shopify.
- [ ] Activate / deactivate / block account works.

## Support tickets

- [ ] `Admin → Support` lists tickets with status and priority filters.
- [ ] Opening a ticket shows description, requester, threaded comments.
- [ ] Status and priority updates save; requester receives in-app notification where applicable.
- [ ] Admin reply is visible to requester; **internal** note is hidden from requester API.
- [ ] Assignee dropdown lists only admin users (`GET /api/admin/staff/admins`).
- [ ] Creating a ticket as vendor/dropshipper (`POST /api/support/tickets`) notifies admins (in-app).

## Notifications

- [ ] Header bell loads notifications for the logged-in user.
- [ ] Unread badge count matches server `unreadCount`.
- [ ] Tapping a notification marks it read (when unread) and refreshes list.
- [ ] **Read all** and **Clear** work and update badge.
- [ ] **Load more** appends older pages when `total` exceeds first page.
- [ ] After **order created** (non-draft), **shipment created** (admin flow), **Shopify sync**, **wallet recharge**, or **support** updates, relevant users see new notifications (smoke-test each flow once).
- [ ] Panel is usable on narrow viewports (width `max-w-[calc(100vw-2rem)]`).

## Analytics

- [ ] `Admin → Analytics` loads without white screen when orders/NDR APIs succeed.
- [ ] On API failure, error state shows with **Retry**.
- [ ] Charts render with orders present; empty states show zeros / “No data” slices without crashing.
- [ ] Export buttons navigate to **Reports** (no fake toast-only export).

## Vendor team (staff) 

- [ ] `Vendor → Team` loads invites from `GET /api/account/team`.
- [ ] Invite, resend, copy link, remove behave as expected.
- [ ] Role dropdown cannot grant platform admin.

## Mobile responsiveness

- [ ] Admin catalogue, vendors, dropshippers, support tables scroll horizontally on small screens.
- [ ] Sheet/drawer modals usable on mobile (close, scroll content).
- [ ] Notification dropdown fits viewport.

## Regression (quick)

- [ ] `GET /api/products` still works for vendor (scoped) and dropshipper (scoped).
- [ ] Marketplace still lists only `status: active` products.
- [ ] Existing `GET /api/vendors` and `GET /api/dropshippers` legacy admin lists still work if referenced elsewhere.
