require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Use raw query via rpc - note: exec_sql function must exist in database
// If not, run this query manually in Supabase SQL Editor:
// SELECT proname, pg_get_function_identity_arguments(oid) as signature
// FROM pg_proc
// WHERE proname IN ('create_business_txn', 'update_business_txn')
//   AND pronamespace = 'public'::regnamespace
// ORDER BY proname, oid;

const sql = `
SELECT proname, pg_get_function_identity_arguments(oid) as signature
FROM pg_proc
WHERE proname IN ('create_business_txn', 'update_business_txn')
  AND pronamespace = 'public'::regnamespace
ORDER BY proname, oid;
`;

supabase.rpc('exec_sql', { sql }).then(({data, error}) => {
  console.log('Data:', JSON.stringify(data, null, 2));
  console.log('Error:', error);
});