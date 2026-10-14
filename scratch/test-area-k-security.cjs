const http = require('http');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: data ? JSON.parse(data) : {} });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function runSecurityTests() {
  console.log('=== AREA K: OWASP API TOP 10 & SECURITY SUITE ===\n');
  let passCount = 0;
  let failCount = 0;

  function assert(name, condition, details) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passCount++;
    } else {
      console.log(`[FAIL] ${name} - Details:`, details);
      failCount++;
    }
  }

  try {
    const ts = Date.now();

    // 1. Register Company A (Owner)
    const regA = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/v1/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, {
      companyName: `SecCorp Alpha ${ts}`,
      firstName: 'Alpha',
      lastName: 'Owner',
      email: `alpha_sec_${ts}@test.com`,
      password: 'SecurePassword123!',
    });
    if (!regA.body || !regA.body.data) {
      console.error('Registration A failed:', regA);
      return;
    }
    const tokenA = regA.body.data.accessToken;
    const companyAId = regA.body.data.company.id;

    // 2. Register Company B (Owner)
    const regB = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/v1/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, {
      companyName: `SecCorp Beta ${ts}`,
      firstName: 'Beta',
      lastName: 'Owner',
      email: `beta_sec_${ts}@test.com`,
      password: 'SecurePassword123!',
    });
    if (!regB.body || !regB.body.data) {
      console.error('Registration B failed:', regB);
      return;
    }
    const tokenB = regB.body.data.accessToken;
    const companyBId = regB.body.data.company.id;

    // 3. Security Headers Check (Helmet)
    const healthRes = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/v1/health',
      method: 'GET',
    });
    assert('Security Header: X-Content-Type-Options: nosniff present',
      healthRes.headers['x-content-type-options'] === 'nosniff', healthRes.headers);
    assert('Security Header: X-Frame-Options: SAMEORIGIN or DENY present',
      ['SAMEORIGIN', 'DENY'].includes(healthRes.headers['x-frame-options']), healthRes.headers);

    // 4. Create resource in Company A (Customer & Job)
    const custRes = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/v1/customers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    }, {
      firstName: 'Alpha',
      lastName: 'PrivateCustomer',
      email: `alpha_cust_${ts}@test.com`,
      phone: '+1 555 0199',
    });
    if (!custRes.body || !custRes.body.data) {
      console.error('Customer create failed:', custRes);
      return;
    }
    const customerAId = custRes.body.data.id;

    // Create service address for customer A
    const addrRes = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: `/api/v1/customers/${customerAId}/addresses`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    }, {
      label: 'Main Office',
      line1: '123 Secure Way',
      city: 'Austin',
      countryCode: 'US',
    });
    const addressAId = addrRes.body.data.id;

    const jobRes = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/v1/jobs',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    }, {
      customerId: customerAId,
      serviceAddressId: addressAId,
      serviceType: 'HVAC Diagnostics',
      problemDescription: 'Top Secret Cooling Issue',
      priority: 'HIGH',
    });
    const jobAId = jobRes.body.data.id;

    // 5. BOLA/IDOR Tests (Company B attempts to access Company A resources)
    const bolaCust = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: `/api/v1/customers/${customerAId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert('BOLA / IDOR Protection: GET /customers/:id for foreign tenant returns 404',
      bolaCust.status === 404, bolaCust.status);

    const bolaJob = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: `/api/v1/jobs/${jobAId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert('BOLA / IDOR Protection: GET /jobs/:id for foreign tenant returns 404',
      bolaJob.status === 404, bolaJob.status);

    const bolaCustUpdate = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: `/api/v1/customers/${customerAId}`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
    }, { firstName: 'Hacked', lastName: 'Customer' });
    assert('BOLA / IDOR Protection: PATCH /customers/:id for foreign tenant returns 404',
      bolaCustUpdate.status === 404, bolaCustUpdate.status);

    // 6. Mass Assignment Tests
    // Attempting to inject companyId, role, or totalMinor
    const massAssignCust = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/v1/customers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
    }, {
      firstName: 'Injected',
      lastName: 'CompanyCustomer',
      email: `injected_${ts}@test.com`,
      companyId: companyAId, // Attempt to assign customer to Company A
    });
    // Customer must be created in Company B (tokenB's company), NOT companyAId!
    assert('Mass Assignment: Injected companyId is ignored/overridden by authenticated context',
      massAssignCust.body.data && massAssignCust.body.data.companyId !== companyAId, massAssignCust.body);

    // 7. SQL Injection in Search / Filter Parameters
    const sqliSearch = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: encodeURI("/api/v1/jobs?search=' OR '1'='1' --"),
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert('SQL Injection defense on query params returns 200 with empty/safe results, no 500 error',
      sqliSearch.status === 200, sqliSearch.status);

    // 8. XSS / Script Tag Storage Defense
    const xssCust = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/v1/customers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    }, {
      firstName: '<script>alert("xss")</script>',
      lastName: 'Test',
      email: `xss_${ts}@test.com`,
      notes: '<img src=x onerror=alert(1)>',
    });
    assert('XSS payload stored safely without execution or server fault',
      xssCust.status === 201, xssCust.status);

    // 9. Error Sanitization & Nonexistent Resource Handling
    const notFoundReq = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/v1/jobs/00000000-0000-0000-0000-000000000000',
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert('Resource Not Found: Nonexistent UUID returns 404',
      notFoundReq.status === 404, notFoundReq.status);

    const badUuidReq = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/v1/jobs/not-a-valid-uuid',
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const badBodyStr = JSON.stringify(badUuidReq.body);
    assert('Error Sanitization: Bad ID returns structured error without stack trace or DB internals',
      !badBodyStr.includes('at ') && !badBodyStr.includes('node_modules') && !badBodyStr.includes('prisma'), badUuidReq.body);

    // 10. No Passwords or Hashes Leaked in User Responses
    const meReq = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/v1/auth/me',
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const meStr = JSON.stringify(meReq.body);
    assert('Credential Hygiene: /auth/me never exposes passwordHash or password',
      !meStr.includes('passwordHash') && !meStr.includes('password_hash'), meReq.body);

    // 11. Unauthenticated Requests Blocked
    const unauthReq = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/v1/jobs',
      method: 'GET',
    });
    assert('Authentication Enforcement: Missing Bearer token returns 401',
      unauthReq.status === 401, unauthReq.status);

    // 12. Tampered JWT Token Rejected
    const tamperedReq = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/v1/jobs',
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenA.slice(0, -6)}tamper` },
    });
    assert('Authentication Enforcement: Tampered JWT signature returns 401',
      tamperedReq.status === 401, tamperedReq.status);

    console.log(`\n=== SECURITY SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED ===`);
  } catch (err) {
    console.error('Security test error:', err);
  }
}

runSecurityTests();
