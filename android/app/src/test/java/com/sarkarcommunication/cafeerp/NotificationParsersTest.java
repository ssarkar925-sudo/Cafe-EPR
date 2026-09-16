package com.sarkarcommunication.cafeerp;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Parser unit tests with anonymized fixtures (Phase 2 testing).
 * Run on CI or a workstation with the Android SDK:
 *   ./gradlew :app:testDebugUnitTest
 * These tests never touch the network, storage, or real credentials.
 */
public class NotificationParsersTest {

    private static final double THRESHOLD = NotificationParsers.CONFIDENCE_THRESHOLD;

    @Test
    public void credit_parsesAmountReferenceAndMaskedAccount() {
        NotificationParsers.ParsedNotification p =
                new NotificationParsers.BankSmsAdapter("State Bank of India").parse(
                        "SBI Alerts",
                        "Rs.5,000 credited to A/c XXXX4521 by RAMESH UTR 123456789012 on 12-09-26");
        assertEquals("bank_credit", p.eventType);
        assertEquals(Double.valueOf(5000.0), p.amount);
        assertEquals("credit", p.direction);
        assertEquals("123456789012", p.reference);
        assertEquals("4521", p.accountLast4);
        assertEquals("2026-09-12", p.occurredAt);
        assertTrue(p.confidence >= THRESHOLD);
    }

    @Test
    public void debit_parsesWithoutBillKeywords() {
        NotificationParsers.ParsedNotification p =
                new NotificationParsers.BankSmsAdapter().parse(
                        "HDFC Bank",
                        "Rs.2,000 debited from A/c ending 7788 to RAMESH. Ref 987654321012");
        assertEquals("bank_debit", p.eventType);
        assertEquals(Double.valueOf(2000.0), p.amount);
        assertEquals("debit", p.direction);
        assertEquals("7788", p.accountLast4);
        assertTrue(p.confidence >= THRESHOLD);
    }

    @Test
    public void duplicateNotification_parsesIdentically() {
        NotificationParsers.NotificationAdapter adapter = new NotificationParsers.UpiAdapter();
        String text = "UPI payment of Rs.350 received from Suresh. UTR 111122223333";
        NotificationParsers.ParsedNotification first = adapter.parse("GPay", text);
        NotificationParsers.ParsedNotification second = adapter.parse("GPay", text);
        assertEquals(first.amount, second.amount);
        assertEquals(first.reference, second.reference);
        assertEquals(first.eventType, second.eventType);
        assertEquals("upi", first.eventType);
    }

    @Test
    public void repeatedDelivery_sameFieldsForIdempotency() {
        NotificationParsers.ParsedNotification p =
                NotificationParsers.adapterFor("com.google.android.apps.nbu.paisa.user")
                        .parse("GPay", "Rs.100 received. UTR 999988887777");
        assertNotNull(p.amount);
        assertNotNull(p.reference);
        // Same input must always yield the same output (server dedupes on it).
        NotificationParsers.ParsedNotification again =
                NotificationParsers.adapterFor("com.google.android.apps.nbu.paisa.user")
                        .parse("GPay", "Rs.100 received. UTR 999988887777");
        assertEquals(p.amount, again.amount);
        assertEquals(p.reference, again.reference);
    }

    @Test
    public void malformedNotification_belowThreshold() {
        NotificationParsers.ParsedNotification p =
                new NotificationParsers.BankSmsAdapter().parse("App", "hello world");
        assertNull(p.amount);
        assertTrue(p.confidence < THRESHOLD);
    }

    @Test
    public void unknownNotification_notFinancial() {
        NotificationParsers.ParsedNotification p =
                NotificationParsers.adapterFor("com.example.shop").parse("Shop", "Your package arrives tomorrow at noon.");
        assertNull(p.amount);
        assertTrue(p.confidence < THRESHOLD);
        assertTrue(p.ambiguity.size() > 0);
    }

    @Test
    public void otpOnlyText_notATransaction() {
        NotificationParsers.ParsedNotification p =
                new NotificationParsers.BankSmsAdapter().parse("Bank", "Your OTP is 482913. Do not share it.");
        assertNull(p.amount);
        assertTrue(p.confidence < THRESHOLD);
    }

    @Test
    public void unsupportedApp_routesToGeneric() {
        NotificationParsers.NotificationAdapter adapter =
                NotificationParsers.adapterFor("com.unknown.game");
        assertTrue(adapter instanceof NotificationParsers.GenericAdapter);
    }

    @Test
    public void knownApps_routeToProviders() {
        assertTrue(NotificationParsers.adapterFor("com.csc.digipay") instanceof NotificationParsers.AepsAdapter);
        assertTrue(NotificationParsers.adapterFor("com.spicemoney.agent") instanceof NotificationParsers.DmtAdapter);
        assertTrue(NotificationParsers.adapterFor("com.phonepe.app") instanceof NotificationParsers.UpiAdapter);
        assertTrue(NotificationParsers.adapterFor("com.hdfc.bank") instanceof NotificationParsers.BankSmsAdapter);
    }

    @Test
    public void bareAccountDigits_droppedAsUnsafe() {
        // A bare 6-digit labeled fragment is NOT safe to keep.
        NotificationParsers.ParsedNotification p =
                new NotificationParsers.BankSmsAdapter().parse("Bank", "Rs.100 credited to A/c 778866. Ref 123456789012");
        assertNull(p.accountLast4);
        assertEquals(Double.valueOf(100.0), p.amount);
    }

    @Test
    public void labeledBalance_keptUnlabeledDropped() {
        NotificationParsers.ParsedNotification withBalance =
                new NotificationParsers.BankSmsAdapter().parse("Bank", "Rs.100 credited. Avl Bal Rs.9,800. Ref 123456789012");
        assertEquals(Double.valueOf(9800.0), withBalance.availableBalance);
        NotificationParsers.ParsedNotification withoutBalance =
                new NotificationParsers.BankSmsAdapter().parse("Bank", "Rs.100 credited. Total 9800. Ref 123456789012");
        assertNull(withoutBalance.availableBalance);
    }
}
