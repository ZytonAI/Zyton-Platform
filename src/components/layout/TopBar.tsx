import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface TopBarProps {
  title: string;
  userEmail?: string;
}

export function TopBar({ title, userEmail }: TopBarProps) {
  const initials = userEmail ? userEmail[0].toUpperCase() : "U";

  return (
    <header className="h-14 border-b bg-white flex items-center justify-between px-6 shrink-0">
      <h1 className="text-base font-semibold text-gray-800">{title}</h1>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground hidden sm:block">
          {userEmail}
        </span>
        <Avatar className="w-8 h-8">
          <AvatarFallback className="bg-primary text-white text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
