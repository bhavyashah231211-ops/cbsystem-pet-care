# CBSystem Pet Care

Pet care business management: staff app, customer booking/portal page, and a Supabase Edge Function that syncs them.

```
staff/index.html                      staff app (PIN login, sync)
customer/index.html                   customer booking + My Pets portal
supabase/functions/cbs-pet/index.ts   Edge Function (the only thing that touches the database)
```

## Setup

1. **Supabase project:** create a free project at supabase.com. In the SQL editor run:
   ```sql
   create table if not exists cbs_pet(id text primary key, data jsonb, ts bigint);
   alter table cbs_pet enable row level security;
   ```
   (No policies = the table is closed to direct access. Only the function can use it.)
2. **Deploy the function** (needs the Supabase CLI, logged in and linked to your project):
   ```
   supabase secrets set STAFF_KEY=choose-a-long-random-string
   supabase functions deploy cbs-pet --no-verify-jwt
   ```
   Function URL: `https://<project-ref>.supabase.co/functions/v1/cbs-pet`
3. **Customer page:** in `customer/index.html` replace `PASTE_YOUR_FUNCTION_URL_HERE` with the function URL.
4. **Host** the repo with GitHub Pages (Settings → Pages → Deploy from branch → `main` / root).
   - Staff: `https://<user>.github.io/<repo>/staff/`
   - Customers: `https://<user>.github.io/<repo>/customer/`
5. **Connect the staff app:** log in as Owner → Settings → Cloud sync & hooks → enter the function URL and your STAFF_KEY → Save & connect. Repeat on each staff device.
6. **Change the default PINs** (Owner 1234, Desk 1111, Care 2222/3333) in Settings → Staff & PINs.

## Optional hooks
Settings accepts webhook URLs for SMS, email and payments. Point them at your own serverless functions that hold Twilio/Stripe secrets.

## Security notes
- Never commit STAFF_KEY or the Supabase service-role key.
- Customer portal codes are 4 digits with a 5-try lockout (15 min).
- Do not commit backup exports (they contain customer data).
