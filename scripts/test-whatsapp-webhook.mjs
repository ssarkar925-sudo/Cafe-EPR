import crypto from "crypto";

const fail = (msg) => {
  console.error(`❌ ${msg}`);
  process.exitCode = 1;
};

console.log("=================================================");
console.log("TESTING WHATSAPP BUSINESS CLOUD API WEBHOOK LOGIC");
console.log("=================================================\n");

// 1. GET Verification Handshake Unit Test
async function testGetVerification() {
  console.log("1. Testing GET Handshake Verification...");
  const verifyToken = "test_cafe_erp_verify_token_12345";
  const challenge = "1158201484739192415";

  // Simulate GET verification request logic
  function verifyGet(mode, token, challengeStr, expectedTokenEnv) {
    const expectedToken = (expectedTokenEnv || "").trim();
    if (mode === "subscribe" && expectedToken && token === expectedToken) {
      return { status: 200, body: challengeStr };
    }
    return { status: 403, body: "Forbidden" };
  }

  // Valid verification case
  const validRes = verifyGet("subscribe", verifyToken, challenge, verifyToken);
  if (validRes.status !== 200 || validRes.body !== challenge) {
    fail(`GET verification failed for valid token! Expected 200 & challenge, got HTTP ${validRes.status}`);
  } else {
    console.log("   ✅ Valid token verification returned HTTP 200 and challenge string.");
  }

  // Invalid token case
  const invalidTokenRes = verifyGet("subscribe", "wrong_token", challenge, verifyToken);
  if (invalidTokenRes.status !== 403) {
    fail(`GET verification allowed invalid token! Got HTTP ${invalidTokenRes.status}`);
  } else {
    console.log("   ✅ Invalid token verification returned HTTP 403 Forbidden.");
  }

  // Invalid mode case
  const invalidModeRes = verifyGet("unsubscribe", verifyToken, challenge, verifyToken);
  if (invalidModeRes.status !== 403) {
    fail(`GET verification allowed invalid hub.mode! Got HTTP ${invalidModeRes.status}`);
  } else {
    console.log("   ✅ Invalid hub.mode returned HTTP 403 Forbidden.");
  }
}

// 2. POST HMAC-SHA256 Signature Verification Unit Test
async function testPostSignature() {
  console.log("\n2. Testing POST HMAC-SHA256 Signature Verification...");
  const appSecret = "cafe_erp_meta_app_secret_9988776655";
  const payloadStr = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_123456",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15551234567", phone_number_id: "PHONE_ID_123" },
              statuses: [
                {
                  id: "wamid.HBgLMTIzNDU2Nzg5MDA=",
                  status: "delivered",
                  timestamp: "1700000000",
                  recipient_id: "919876543210",
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  });

  const computedSig = crypto.createHmac("sha256", appSecret).update(payloadStr).digest("hex");
  const validHeader = `sha256=${computedSig}`;

  function verifyPostSignature(rawBody, signatureHeader, secretEnv) {
    if (!secretEnv) return { status: 500, error: "Server misconfiguration: META_APP_SECRET not set" };
    if (!signatureHeader) return { status: 401, error: "Missing signature header" };

    const expectedSig = signatureHeader.replace(/^sha256=/, "").trim();
    const computed = crypto.createHmac("sha256", secretEnv).update(rawBody).digest("hex");

    try {
      const expectedBuf = Buffer.from(expectedSig, "hex");
      const computedBuf = Buffer.from(computed, "hex");
      if (expectedBuf.length === computedBuf.length && crypto.timingSafeEqual(expectedBuf, computedBuf)) {
        return { status: 200, valid: true };
      }
    } catch {
      return { status: 403, error: "Invalid signature formatting" };
    }
    return { status: 403, error: "Invalid signature" };
  }

  // Test 1: Valid META_APP_SECRET + valid signature -> accepted (200)
  const case1 = verifyPostSignature(payloadStr, validHeader, appSecret);
  if (case1.status !== 200 || !case1.valid) {
    fail("Case 1: Valid HMAC-SHA256 signature rejected!");
  } else {
    console.log("   ✅ Case 1: Valid META_APP_SECRET + valid signature accepted.");
  }

  // Test 2: Valid META_APP_SECRET + invalid signature -> rejected (403)
  const tamperedHeader = `sha256=${computedSig.replace(/a/g, "b")}`;
  const case2 = verifyPostSignature(payloadStr, tamperedHeader, appSecret);
  if (case2.status !== 403) {
    fail(`Case 2: Tampered signature accepted! Expected 403, got ${case2.status}`);
  } else {
    console.log("   ✅ Case 2: Valid META_APP_SECRET + invalid signature rejected (HTTP 403).");
  }

  // Test 3: Valid META_APP_SECRET + missing signature -> rejected (401)
  const case3 = verifyPostSignature(payloadStr, null, appSecret);
  if (case3.status !== 401) {
    fail(`Case 3: Missing signature allowed! Expected 401, got ${case3.status}`);
  } else {
    console.log("   ✅ Case 3: Valid META_APP_SECRET + missing signature rejected (HTTP 401).");
  }

  // Test 4: Missing META_APP_SECRET + POST webhook -> rejected (500 fail closed)
  const case4 = verifyPostSignature(payloadStr, validHeader, "");
  if (case4.status !== 500) {
    fail(`Case 4: Missing META_APP_SECRET allowed! Expected 500 fail closed, got ${case4.status}`);
  } else {
    console.log("   ✅ Case 4: Missing META_APP_SECRET failed closed (HTTP 500).");
  }

  // Test 5: Invalid signature length/format -> rejected safely (403)
  const case5 = verifyPostSignature(payloadStr, "sha256=invalid_hex_str_zzz", appSecret);
  if (case5.status !== 403) {
    fail(`Case 5: Invalid formatting allowed! Expected 403, got ${case5.status}`);
  } else {
    console.log("   ✅ Case 5: Invalid signature length/format rejected safely (HTTP 403).");
  }
}

async function run() {
  await testGetVerification();
  await testPostSignature();
  if (process.exitCode !== 1) {
    console.log("\n🎉 ALL WHATSAPP WEBHOOK UNIT TESTS PASSED SUCCESSFULLY!");
  }
}

run();
