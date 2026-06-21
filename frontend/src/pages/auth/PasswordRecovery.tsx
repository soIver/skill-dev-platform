import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { requestPasswordRecovery } from "../../auth";
import FieldRequirements from "../../components/FieldRequirements";
import { LoadingText } from "../../components/LoadingText";
import { useToast } from "../../components/ToastProvider";
import { checkEmail } from "../../validation";
import { flashField } from "../../utils";

export default function PasswordRecovery() {
  const [email, setEmail] = useState("");
  const [confirmedEmail, setConfirmedEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const emailChecks = checkEmail(email);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!emailChecks.valid) {
      flashField(emailRef.current);
      showToast({
        title: "Ошибка восстановления пароля",
        message: "Пожалуйста, укажите корректный адрес электронной почты.",
        variant: "error",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await requestPasswordRecovery(email);
      setConfirmedEmail(email);
    } catch (error) {
      showToast({
        title: "Ошибка восстановления пароля",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Не удалось отправить письмо для восстановления пароля.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-panel">
        <h1 className="auth-panel-header">Восстановление пароля</h1>

        {confirmedEmail ? (
          <div className="space-y-6">
            <p className="text-base text-gray-900">
              На электронную почту {confirmedEmail} было отправлено письмо с инструкцией для восстановления пароля.
            </p>
            <button type="button" onClick={() => navigate("/auth/login")} className="primary-button">
              Вход
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Электронная почта
              </label>
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onFocus={() => setIsEmailFocused(true)}
                onBlur={() => setIsEmailFocused(false)}
                className="input-field"
                placeholder="you@example.com"
                maxLength={64}
                required
              />
              <FieldRequirements
                visible={isEmailFocused}
                requirements={[
                  { text: "Корректный адрес электронной почты", met: emailChecks.valid },
                ]}
              />
            </div>

            <button type="submit" disabled={isSubmitting} className="primary-button mt-4">
              {isSubmitting ? <LoadingText text="Отправка..." /> : "Восстановить пароль"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
