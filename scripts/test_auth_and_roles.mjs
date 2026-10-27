import http from "http";
import app from "../artifacts/api-server/dist/index.mjs";

const PORT = 5566;

async function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      console.log(`Test server running on port ${PORT}`);
      resolve(server);
    });
  });
}

async function request(path, options = {}) {
  const url = `http://localhost:${PORT}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get("content-type");
  let data;
  if (contentType && contentType.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, data };
}

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ✗ FAILED: ${message}`);
  }
}

async function runTests() {
  console.log("\n=======================================================");
  console.log("Starting Medistock Comprehensive Test Suite");
  console.log("=======================================================\n");

  const server = await startServer();

  try {
    // ----------------------------------------------------
    // TEST 1: Admin Login & Protected Dashboard
    // ----------------------------------------------------
    console.log("[TEST SUITE 1] Admin Login & Dashboard Access");

    const adminLoginRes = await request("/api/auth/login", {
      method: "POST",
      body: {
        identifier: "admin@medistock.com",
        password: "Admin@123",
        role: "admin",
      },
    });

    assert(adminLoginRes.status === 200, "Admin login returns HTTP 200");
    assert(adminLoginRes.data.user?.role === "admin", "Admin role is returned");
    assert(typeof adminLoginRes.data.token === "string", "JWT token is returned");
    const adminToken = adminLoginRes.data.token;

    // Admin accesses Dashboard Summary
    const adminSummaryRes = await request("/api/dashboard/summary", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminSummaryRes.status === 200, "Admin can access /api/dashboard/summary");
    assert(adminSummaryRes.data.medicineTypes !== undefined, "Dashboard summary returns medicineTypes count");

    // Admin accesses Stock Report
    const adminReportsRes = await request("/api/reports/stock", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminReportsRes.status === 200, "Admin can access /api/reports/stock");

    // ----------------------------------------------------
    // TEST 2: Customer Registration with Email
    // ----------------------------------------------------
    console.log("\n[TEST SUITE 2] Customer Registration (With Email)");

    const customerEmailRegRes = await request("/api/auth/register-customer", {
      method: "POST",
      body: {
        fullName: "Aarav Sharma",
        age: 29,
        phone: "9871112233",
        address: "Flat 402, Green Meadows, Bengaluru",
        email: "aarav.sharma@example.com",
        password: "AaravPassword123",
        confirmPassword: "AaravPassword123",
      },
    });

    assert(customerEmailRegRes.status === 201, "Customer registration returns HTTP 201 Created");
    assert(customerEmailRegRes.data.user?.fullName === "Aarav Sharma", "Customer full name matches");
    assert(customerEmailRegRes.data.user?.role === "customer", "Registered user role is 'customer'");
    assert(customerEmailRegRes.data.user?.email === "aarav.sharma@example.com", "Email is saved");
    assert(typeof customerEmailRegRes.data.token === "string", "Customer receives session token");
    const customerToken = customerEmailRegRes.data.token;

    // ----------------------------------------------------
    // TEST 3: Customer Registration Without Email (Phone Only)
    // ----------------------------------------------------
    console.log("\n[TEST SUITE 3] Customer Registration (Without Email - Phone Only)");

    // Step 3a: Request Phone OTP
    const sendOtpRes = await request("/api/auth/phone-otp/send", {
      method: "POST",
      body: { phone: "9822334455" },
    });
    assert(sendOtpRes.status === 200, "Send OTP returns HTTP 200");
    assert(sendOtpRes.data.success === true, "OTP send is successful");
    const otpCode = sendOtpRes.data.code;
    assert(Boolean(otpCode), `Received verification OTP code: ${otpCode}`);

    // Step 3b: Verify OTP
    const verifyOtpRes = await request("/api/auth/phone-otp/verify", {
      method: "POST",
      body: { phone: "9822334455", code: otpCode },
    });
    assert(verifyOtpRes.status === 200, "Verify OTP returns HTTP 200");
    assert(verifyOtpRes.data.success === true, "Phone is verified successfully");

    // Step 3c: Register Customer with Phone Only (no email)
    const phoneCustomerRegRes = await request("/api/auth/register-customer", {
      method: "POST",
      body: {
        fullName: "Sunita Verma",
        age: 52,
        phone: "9822334455",
        address: "74 Gandhi Nagar, Jaipur",
        hasNoEmail: true,
        password: "SunitaPassword456",
        confirmPassword: "SunitaPassword456",
      },
    });

    assert(phoneCustomerRegRes.status === 201, "Phone-only registration returns HTTP 201 Created");
    assert(phoneCustomerRegRes.data.user?.fullName === "Sunita Verma", "Phone customer name matches");
    assert(phoneCustomerRegRes.data.user?.email === null, "Email is null (no fake email generated)");
    assert(phoneCustomerRegRes.data.user?.role === "customer", "Role is 'customer'");
    const phoneCustomerToken = phoneCustomerRegRes.data.token;

    // ----------------------------------------------------
    // TEST 4: Validation & Duplicate Prevention
    // ----------------------------------------------------
    console.log("\n[TEST SUITE 4] Input Validation & Duplicate Prevention");

    // Duplicate email
    const dupEmailRes = await request("/api/auth/register-customer", {
      method: "POST",
      body: {
        fullName: "Another Person",
        age: 30,
        phone: "9900112233",
        address: "Some address",
        email: "aarav.sharma@example.com", // existing
        password: "password123",
        confirmPassword: "password123",
      },
    });
    assert(dupEmailRes.status === 409, "Duplicate email registration rejected with HTTP 409 Conflict");

    // Duplicate phone
    const dupPhoneRes = await request("/api/auth/register-customer", {
      method: "POST",
      body: {
        fullName: "Another Person",
        age: 30,
        phone: "9822334455", // existing phone
        address: "Some address",
        email: "unique.email@example.com",
        password: "password123",
        confirmPassword: "password123",
      },
    });
    assert(dupPhoneRes.status === 409, "Duplicate phone registration rejected with HTTP 409 Conflict");

    // Password mismatch
    const mismatchRes = await request("/api/auth/register-customer", {
      method: "POST",
      body: {
        fullName: "Test User",
        age: 25,
        phone: "9988776655",
        address: "Test address",
        email: "test.mismatch@example.com",
        password: "password123",
        confirmPassword: "differentPassword",
      },
    });
    assert(mismatchRes.status === 400, "Password mismatch rejected with HTTP 400 Bad Request");

    // Invalid Age
    const invalidAgeRes = await request("/api/auth/register-customer", {
      method: "POST",
      body: {
        fullName: "Test User",
        age: -5,
        phone: "9988776655",
        address: "Test address",
        email: "test.age@example.com",
        password: "password123",
        confirmPassword: "password123",
      },
    });
    assert(invalidAgeRes.status === 400, "Invalid negative age rejected with HTTP 400 Bad Request");

    // No email & unverified phone
    const unverifiedNoEmailRes = await request("/api/auth/register-customer", {
      method: "POST",
      body: {
        fullName: "Unverified Person",
        age: 35,
        phone: "9911223344",
        address: "Test address",
        hasNoEmail: true,
        password: "password123",
        confirmPassword: "password123",
      },
    });
    assert(unverifiedNoEmailRes.status === 400, "Unverified phone-only registration rejected with HTTP 400");

    // ----------------------------------------------------
    // TEST 5: Customer Login (Both Email & Phone)
    // ----------------------------------------------------
    console.log("\n[TEST SUITE 5] Customer Login Options");

    // Login using Email
    const loginEmailRes = await request("/api/auth/login", {
      method: "POST",
      body: {
        identifier: "aarav.sharma@example.com",
        password: "AaravPassword123",
        role: "customer",
      },
    });
    assert(loginEmailRes.status === 200, "Customer can log in using email address");
    assert(loginEmailRes.data.user?.fullName === "Aarav Sharma", "Correct customer account logged in via email");

    // Login using Phone
    const loginPhoneRes = await request("/api/auth/login", {
      method: "POST",
      body: {
        identifier: "9822334455",
        password: "SunitaPassword456",
        role: "customer",
      },
    });
    assert(loginPhoneRes.status === 200, "Customer can log in using phone number");
    assert(loginPhoneRes.data.user?.fullName === "Sunita Verma", "Correct customer account logged in via phone");

    // Wrong password
    const wrongPassRes = await request("/api/auth/login", {
      method: "POST",
      body: {
        identifier: "aarav.sharma@example.com",
        password: "WrongPassword999",
        role: "customer",
      },
    });
    assert(wrongPassRes.status === 401, "Invalid password rejected with HTTP 401 Unauthorized");

    // ----------------------------------------------------
    // TEST 6: Role-Based Access Control (RBAC) & Security
    // ----------------------------------------------------
    console.log("\n[TEST SUITE 6] Role-Based Access Control (RBAC)");

    // Customer tries to use Admin Login
    const customerAsAdminLoginRes = await request("/api/auth/login", {
      method: "POST",
      body: {
        identifier: "aarav.sharma@example.com",
        password: "AaravPassword123",
        role: "admin", // requesting admin role!
      },
    });
    assert(
      customerAsAdminLoginRes.status === 403,
      "Customer attempting Admin Login is blocked with HTTP 403 Forbidden"
    );

    // Customer tries to access Admin Dashboard Summary
    const customerSummaryRes = await request("/api/dashboard/summary", {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert(
      customerSummaryRes.status === 403,
      "Customer blocked from /api/dashboard/summary with HTTP 403 Forbidden"
    );

    // Customer tries to access Admin Stock Reports
    const customerReportsRes = await request("/api/reports/stock", {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert(
      customerReportsRes.status === 403,
      "Customer blocked from /api/reports/stock with HTTP 403 Forbidden"
    );

    // Customer tries to create a medicine (Admin only)
    const customerAddMedRes = await request("/api/medicines", {
      method: "POST",
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        name: "Unauthorized Drug",
        quantity: 100,
        unitPrice: 10,
        expiryDate: "2027-01-01",
      },
    });
    assert(
      customerAddMedRes.status === 403,
      "Customer blocked from adding medicines with HTTP 403 Forbidden"
    );

    // Customer CAN browse available medicines (Customer Feature)
    const customerBrowseRes = await request("/api/medicines", {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert(customerBrowseRes.status === 200, "Customer CAN view medicine catalog");
    assert(Array.isArray(customerBrowseRes.data), "Medicine catalog returns array of available medicines");

    // Customer CAN submit feedback
    const customerFeedbackRes = await request("/api/feedback", {
      method: "POST",
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        rating: 5,
        comment: "Excellent inventory availability and clean interface!",
      },
    });
    assert(customerFeedbackRes.status === 201, "Customer CAN submit feedback");

    // Customer CAN view their own profile
    const customerProfileRes = await request("/api/auth/me", {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert(customerProfileRes.status === 200, "Customer CAN view their own profile");
    assert(customerProfileRes.data.role === "customer", "Profile role is customer");
    assert(customerProfileRes.data.fullName === "Aarav Sharma", "Profile belongs to customer");

    console.log("\n=======================================================");
    console.log(`Test Results: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log("=======================================================\n");

    if (passedTests === totalTests) {
      console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
    } else {
      console.error("Some tests failed.");
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("Test execution error:", err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

runTests();
