-- Set up custom Types
CREATE TYPE user_role AS ENUM (
  'administrator',
  'office_admin',
  'operation_manager',
  'hr',
  'inventory',
  'sales',
  'service_staff',
  'customer'
);
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'in_progress', 'quality_check', 'ready', 'completed', 'cancelled');
CREATE TYPE loyalty_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum');

-- 1. Profiles (Linked to auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role user_role DEFAULT 'customer' NOT NULL,
  loyalty_tier loyalty_tier DEFAULT 'bronze' NOT NULL,
  autopoints INTEGER DEFAULT 0 NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Turn on RLS for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins and Staff can view all profiles" ON profiles FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role IN ('administrator', 'office_admin', 'operation_manager', 'hr', 'inventory', 'sales', 'service_staff')
  )
);

-- Trigger to auto-create profile on sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.email, 'customer');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. Services
CREATE TABLE services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  duration TEXT NOT NULL,
  icon TEXT,
  tag TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
-- Everyone can view active services
CREATE POLICY "Anyone can view active services" ON services FOR SELECT USING (is_active = true);

-- Insert Initial Services
INSERT INTO services (name, description, price, duration, icon, tag) VALUES
  ('Basic Wash', 'Exterior wash + rinse', 299, '45 min', '💧', 'Popular'),
  ('Full Detail', 'Interior + exterior complete', 1299, '3 hrs', '✨', 'Best Value'),
  ('Paint Protection', 'Ceramic coating + PPF', 3499, '6 hrs', '🛡️', 'Premium'),
  ('SPF+ Premium', 'Full detail + AI scan + AR', 4999, '8 hrs', '🚀', 'Signature');

-- 3. Bookings
CREATE TABLE bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  status booking_status DEFAULT 'pending' NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  total_price NUMERIC,
  payment_status TEXT DEFAULT 'unpaid',
  location_id TEXT DEFAULT 'bay_3',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers can view own bookings" ON bookings FOR SELECT USING (auth.uid() = customer_id);
CREATE POLICY "Customers can create bookings" ON bookings FOR INSERT WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Staff/Admins can view all bookings" ON bookings FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role IN ('administrator', 'office_admin', 'operation_manager', 'hr', 'inventory', 'sales', 'service_staff')
  )
);
CREATE POLICY "Staff/Admins can update bookings" ON bookings FOR UPDATE USING (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role IN ('administrator', 'office_admin', 'operation_manager', 'hr', 'inventory', 'sales', 'service_staff')
  )
);

-- Enable Realtime on bookings
ALTER PUBLICATION supabase_realtime ADD TABLE bookings;

-- 4. Damage Reports
CREATE TABLE damage_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  areas_detected JSONB,
  total_estimate NUMERIC,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE damage_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers can view own reports" ON damage_reports FOR SELECT USING (auth.uid() = customer_id);
CREATE POLICY "Customers can insert their own reports" ON damage_reports FOR INSERT WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Staff can view all reports" ON damage_reports FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role IN ('administrator', 'office_admin', 'operation_manager', 'hr', 'inventory', 'sales', 'service_staff')
  )
);

-- 5. Notifications
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  icon TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own generic notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Example trigger for updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
