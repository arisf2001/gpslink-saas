import { test } from "node:test";
import assert from "node:assert/strict";
import { speak, validCertUrl, verifyAlexaRequest } from "../lib/alexa";

test("only Amazon's echo.api certificate URLs are accepted", () => {
  assert.equal(validCertUrl("https://s3.amazonaws.com/echo.api/echo-api-cert.pem"), true);
  assert.equal(validCertUrl("https://s3.amazonaws.com:443/echo.api/echo-api-cert.pem"), true);
  assert.equal(validCertUrl("https://S3.AMAZONAWS.COM/echo.api/../echo.api/cert.pem"), true);
  assert.equal(validCertUrl("http://s3.amazonaws.com/echo.api/cert.pem"), false);
  assert.equal(validCertUrl("https://notamazon.com/echo.api/cert.pem"), false);
  assert.equal(validCertUrl("https://s3.amazonaws.com/EcHo.aPi/cert.pem"), false);
  assert.equal(validCertUrl("https://s3.amazonaws.com:563/echo.api/cert.pem"), false);
  assert.equal(validCertUrl("https://s3.amazonaws.com/invalid.path/cert.pem"), false);
  assert.equal(validCertUrl("https://s3.amazonaws.com/echo.api/../bad/cert.pem"), false);
});

test("requests without a valid signature or with an old timestamp are rejected", async () => {
  const h = new Headers({ signaturecertchainurl: "https://evil.com/echo.api/c.pem", "signature-256": "abc" });
  assert.equal(await verifyAlexaRequest(h, "{}", new Date().toISOString()), "bad signature headers");
  const h2 = new Headers({ signaturecertchainurl: "https://s3.amazonaws.com/echo.api/c.pem", "signature-256": "abc" });
  assert.equal(await verifyAlexaRequest(h2, "{}", new Date(Date.now() - 600_000).toISOString()), "stale request");
  assert.equal(await verifyAlexaRequest(new Headers(), "{}", new Date().toISOString()), "bad signature headers");
});

test("spoken answers drop links and markdown", () => {
  const r = speak("**Tu Aveo** está en la 27 de Febrero. Mapa: https://maps.google.com/x?y=1", { reprompt: "¿Algo más?" });
  const text = (r.response.outputSpeech as { text: string }).text;
  assert.equal(text, "Tu Aveo está en la 27 de Febrero. Mapa:");
  assert.equal(r.response.shouldEndSession, false);
  assert.ok(speak("Hola", { end: true, linkAccount: true }).response.card);
});
