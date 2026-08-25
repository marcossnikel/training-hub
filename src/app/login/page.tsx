import { LockIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/login-form";
import { getDict } from "@/lib/lang";

export const metadata = { title: "Log in" };

export default async function LoginPage() {
  const { t } = await getDict();

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-muted">
            <LockIcon className="size-4.5 text-muted-foreground" />
          </div>
          <CardTitle as="h1">{t.login.title}</CardTitle>
          <CardDescription>Use your Training Hub account to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
