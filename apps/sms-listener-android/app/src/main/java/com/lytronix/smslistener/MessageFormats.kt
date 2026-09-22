package com.lytronix.smslistener

/**
 * Local, first-line filter: outside test mode, a message is only written to the outbox (and so
 * only ever sent to the server) when its SENDER is allowed AND its TEXT matches a known
 * payment-receipt shape. This is what keeps everything else from that same sender — OTPs,
 * "you sent money" confirmations, promotional texts — off the phone's outbox entirely; they
 * never touch the network. Mirrors server/services/smsParsers.js's bKash regex, so a message
 * that would be parsed there is exactly the one allowed to leave the phone.
 */
object MessageFormats {
    private data class Format(val provider: String, val senders: List<String>, val regex: Regex)

    private val FORMATS = listOf(
        Format(
            provider = "bkash",
            senders = listOf("bkash"),
            regex = Regex(
                """You have received Tk\s*[\d,]+(?:\.\d+)?\s+from\s+\+?\d{10,14}\s*\.?\s*Fee Tk\s*[\d,]+(?:\.\d+)?\s*\.?\s*Balance Tk\s*[\d,]+(?:\.\d+)?\s*\.?\s*TrxID\s+[A-Za-z0-9]+\s+at\s+\d{2}/\d{2}/\d{4}\s+\d{1,2}:\d{2}""",
                RegexOption.IGNORE_CASE
            )
        )
    )

    private fun formatFor(sender: String): Format? {
        val s = sender.trim().lowercase()
        return FORMATS.find { it.senders.contains(s) }
    }

    /**
     * Whether this message should be forwarded (sender already known to be allowed):
     *  - a sender we have no known shape for (a custom one the user added, e.g. a bank) is passed
     *    through as-is — there is nothing here to validate it against;
     *  - a sender we DO know the shape of (bKash) must match it. That is the whole point: bKash
     *    sends OTPs and other texts from the very same sender ID as payment receipts, so the
     *    sender name alone can never tell them apart.
     */
    fun looksLikePaymentReceipt(sender: String, body: String): Boolean {
        val fmt = formatFor(sender) ?: return true
        val flat = body.replace(Regex("""\s+"""), " ")
        return fmt.regex.containsMatchIn(flat)
    }
}
