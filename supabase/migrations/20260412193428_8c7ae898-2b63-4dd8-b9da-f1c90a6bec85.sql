-- Create a unique index for user-specific tab permissions (user_id NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tab_permissions_user_override 
ON public.tab_permissions (role, tab_key, user_id) 
WHERE user_id IS NOT NULL;

-- Ensure admins can delete tab_permissions (for reset functionality)
-- Already covered by existing ALL policy for admins