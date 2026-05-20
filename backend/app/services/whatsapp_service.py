# SPDX-License-Identifier: Apache-2.0

"""
WhatsApp Service via Twilio
Sends flood alerts via Twilio's WhatsApp API
"""
from twilio.rest import Client
from twilio.base.exceptions import TwilioException
import logging
from typing import Optional
from datetime import datetime

from ..config import get_settings

logger = logging.getLogger(__name__)


class WhatsAppService:
    """Service for sending WhatsApp messages via Twilio"""

    def __init__(self):
        self.settings = get_settings()
        self.client = None
        self._message_log: list[dict] = []

        if self.settings.twilio_account_sid and self.settings.twilio_auth_token:
            self.client = Client(
                self.settings.twilio_account_sid,
                self.settings.twilio_auth_token
            )

    def is_configured(self) -> bool:
        """Check if Twilio WhatsApp is properly configured"""
        return bool(
            self.client
            and self.settings.twilio_whatsapp_number
        )

    def _format_whatsapp_number(self, phone: str) -> str:
        """Format phone number for Twilio WhatsApp (whatsapp:+XXXXXXXXXXX)"""
        phone = phone.replace("+", "").replace(" ", "").replace("-", "")
        if not phone.startswith("whatsapp:"):
            phone = f"whatsapp:+{phone}"
        return phone

    def _get_from_number(self) -> str:
        """Get the from WhatsApp number in Twilio format"""
        num = self.settings.twilio_whatsapp_number
        if not num.startswith("whatsapp:"):
            num = num.replace("+", "").replace(" ", "")
            num = f"whatsapp:+{num}"
        return num

    async def send_text_message(
        self,
        to_phone: str,
        message: str,
    ) -> dict:
        """
        Send a text message via WhatsApp using Twilio.

        Args:
            to_phone: Recipient phone number (with country code, e.g., 94771234567)
            message: Text message to send

        Returns:
            API response dict with message_id on success
        """
        if not self.is_configured():
            logger.warning("Twilio WhatsApp not configured - message not sent")
            return {"success": False, "error": "WhatsApp not configured"}

        to_whatsapp = self._format_whatsapp_number(to_phone)
        from_whatsapp = self._get_from_number()

        try:
            msg = self.client.messages.create(
                body=message,
                from_=from_whatsapp,
                to=to_whatsapp
            )

            self._log_message(to_phone, message, "sent", msg.sid)
            logger.info(f"WhatsApp message sent to {to_phone}: {msg.sid}")
            return {"success": True, "message_id": msg.sid}

        except TwilioException as e:
            error_msg = str(e)
            logger.error(f"Twilio WhatsApp error sending to {to_phone}: {error_msg}")
            self._log_message(to_phone, message, "failed", error=error_msg)
            return {"success": False, "error": error_msg}

        except Exception as e:
            error_msg = str(e)
            logger.error(f"Failed to send WhatsApp message: {error_msg}")
            self._log_message(to_phone, message, "failed", error=error_msg)
            return {"success": False, "error": error_msg}

    async def send_alert_message(
        self,
        to_phone: str,
        district: str,
        alert_level: str,
        rainfall_mm: float,
        language: str = "en",
    ) -> dict:
        """
        Send a flood alert message.

        Args:
            to_phone: Recipient phone number
            district: District name
            alert_level: Alert level (GREEN, YELLOW, ORANGE, RED)
            rainfall_mm: Rainfall amount in mm
            language: Language code (en, si, ta)
        """
        message = self._build_alert_message(
            district, alert_level, rainfall_mm, language
        )

        return await self.send_text_message(to_phone, message)

    def _build_alert_message(
        self,
        district: str,
        alert_level: str,
        rainfall_mm: float,
        language: str,
    ) -> str:
        """Build localized alert message"""

        level_info = {
            "GREEN": ("🟢", "Normal", "සාමාන්‍ය", "சாதாரண"),
            "YELLOW": ("🟡", "Watch", "අවධානය", "கவனம்"),
            "ORANGE": ("🟠", "Warning", "අනතුරු ඇඟවීම", "எச்சரிக்கை"),
            "RED": ("🔴", "Severe", "දැඩි අනතුරු", "கடுமையான"),
        }

        emoji, en_level, si_level, ta_level = level_info.get(
            alert_level.upper(), ("⚪", "Unknown", "නොදන්නා", "தெரியாத")
        )

        if language == "si":
            return (
                f"{emoji} *FloodWatch ජල තත්ත්ව අනතුරු ඇඟවීම*\n\n"
                f"📍 දිස්ත්‍රික්කය: {district}\n"
                f"⚠️ තත්ත්වය: {si_level}\n"
                f"🌧️ වර්ෂාපතනය: {rainfall_mm:.1f}mm\n\n"
                f"ආරක්ෂිතව සිටින්න. අවශ්‍ය නම් ආරක්ෂිත ස්ථානයකට යන්න.\n\n"
                f"🔗 floodwatch.teklab.dev"
            )
        elif language == "ta":
            return (
                f"{emoji} *FloodWatch வெள்ள எச்சரிக்கை*\n\n"
                f"📍 மாவட்டம்: {district}\n"
                f"⚠️ நிலை: {ta_level}\n"
                f"🌧️ மழைப்பொழிவு: {rainfall_mm:.1f}mm\n\n"
                f"பாதுகாப்பாக இருங்கள். தேவைப்பட்டால் உயரமான இடத்திற்கு செல்லுங்கள்.\n\n"
                f"🔗 floodwatch.teklab.dev"
            )
        else:
            return (
                f"{emoji} *FloodWatch Flood Alert*\n\n"
                f"📍 District: {district}\n"
                f"⚠️ Level: {en_level}\n"
                f"🌧️ Rainfall: {rainfall_mm:.1f}mm (24h)\n\n"
                f"Stay safe. Move to higher ground if necessary.\n\n"
                f"🔗 floodwatch.teklab.dev"
            )

    async def send_bulk_alerts(
        self,
        subscribers: list[dict],
        district: str,
        alert_level: str,
        rainfall_mm: float,
    ) -> dict:
        """
        Send alert to multiple subscribers.

        Args:
            subscribers: List of subscriber dicts with phone_number and language
            district: District name
            alert_level: Alert level
            rainfall_mm: Rainfall amount

        Returns:
            Summary of sent/failed messages
        """
        sent = 0
        failed = 0
        errors = []

        for sub in subscribers:
            phone = sub.get("phone_number")
            lang = sub.get("language", "en")

            if not phone:
                continue

            result = await self.send_alert_message(
                to_phone=phone,
                district=district,
                alert_level=alert_level,
                rainfall_mm=rainfall_mm,
                language=lang,
            )

            if result.get("success"):
                sent += 1
            else:
                failed += 1
                errors.append({"phone": phone, "error": result.get("error")})

        return {
            "total": len(subscribers),
            "sent": sent,
            "failed": failed,
            "errors": errors[:10],
        }

    def _log_message(
        self,
        to_phone: str,
        message: str,
        status: str,
        message_id: Optional[str] = None,
        error: Optional[str] = None,
    ):
        """Log message for debugging"""
        self._message_log.append({
            "to": to_phone,
            "message": message[:100],
            "status": status,
            "message_id": message_id,
            "error": error,
            "timestamp": datetime.utcnow().isoformat(),
        })
        self._message_log = self._message_log[-100:]

    def get_message_log(self) -> list[dict]:
        """Get recent message log"""
        return self._message_log


# Singleton instance
whatsapp_service = WhatsAppService()
