import { useState } from "react"
import useStore from "../hooks/useStore"

export default function Home() {
    const user = useStore((state) => state.user);
    const setUser = useStore((state) => state.setUser);
    const clearUser = useStore((state) => state.clearUser);

    const [name, setName] = useState(user?.name ?? "");
    const [email, setEmail] = useState(user?.email ?? "");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setUser({ id: Date.now(), name, email, token: "", role: "" });
    }

    return (
        <div className="max-w-xl mx-auto p-6 rounded-xl bg-gray-100">
            <h1 className="text-3xl font-bold mb-4">Добро пожаловать, {user?.name ?? 'гость'}</h1>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Имя</label>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 p-2"
                        placeholder="Ваше имя"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 p-2"
                        placeholder="you@example.com"
                    />
                </div>

                <div className="flex gap-2">
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">
                        Сохранить
                    </button>
                    <button
                        type="button"
                        onClick={() => { setName(''); setEmail(''); clearUser(); }}
                        className="px-4 py-2 bg-gray-300 rounded"
                    >
                        Сброс
                    </button>
                </div>
            </form>
        </div>
    )
}