import { UserPlusIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignupForm } from "@/components/signup-form";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-muted">
            <UserPlusIcon className="size-4.5 text-muted-foreground" />
          </div>
          <CardTitle as="h1">Create your account</CardTitle>
          <CardDescription>Start your private training journal.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm />
        </CardContent>
      </Card>
    </div>
  );
}
