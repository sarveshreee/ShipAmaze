import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Check if admin already exists
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  const adminExists = existingUsers?.users?.some(u => u.email === "admin@admin.com");
  
  if (adminExists) {
    return new Response(JSON.stringify({ message: "Admin already exists" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Create admin user
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: "admin@admin.com",
    password: "admin123",
    email_confirm: true,
    user_metadata: { full_name: "Admin", role: "admin" },
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }

  return new Response(JSON.stringify({ message: "Admin created", userId: data.user.id }), {
    headers: { "Content-Type": "application/json" },
  });
});
