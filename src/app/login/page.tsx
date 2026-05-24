import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import LoginForm from "@/components/login-form";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect("/");
  return <LoginForm />;
}
