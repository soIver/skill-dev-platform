import { useNavigate } from "react-router-dom";

export default function NotFound() {
    const navigate = useNavigate();
    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="auth-panel text-center">
                <h1 className="text-4xl font-bold text-primary">404</h1>
                <p className="text-2xl mb-2">Страница не найдена :(</p>
                <p className="text-lg mb-6 text-gray-600">Проверьте, нет ли в адресе лишних символов</p>

                <button
                    onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/")}
                    className="primary-button"
                >
                    Вернуться туда, где всё работало
                </button>
            </div>
        </div>
    );
}