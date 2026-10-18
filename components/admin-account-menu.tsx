"use client";

import { useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Settings, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { OwnerProfile } from "@/lib/owner-profile";

function SignOutConfirmation({ open, onOpenChange, returnFocus }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const [pending, setPending] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  return <AlertDialog open={open} onOpenChange={(nextOpen) => { if (!pending) onOpenChange(nextOpen); }}>
    <AlertDialogContent className="signout-dialog" initialFocus={cancelRef} finalFocus={returnFocus}>
      <div className="signout-dialog-icon" aria-hidden="true"><LogOut size={22} /></div>
      <AlertDialogHeader>
        <AlertDialogTitle>Sign out of your workspace?</AlertDialogTitle>
        <AlertDialogDescription>You’ll need to sign in again to manage your store. Make sure you’ve saved any changes before you leave.</AlertDialogDescription>
      </AlertDialogHeader>
      <form method="post" action="/api/admin/logout" onSubmit={() => setPending(true)} aria-busy={pending}>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef} className="button secondary" disabled={pending}>Stay signed in</AlertDialogCancel>
          <AlertDialogAction type="submit" className="button primary" disabled={pending} aria-label={pending ? "Signing out" : "Sign out"}><LogOut size={15} />{pending ? "Signing out…" : "Sign out"}</AlertDialogAction>
        </AlertDialogFooter>
      </form>
    </AlertDialogContent>
  </AlertDialog>;
}

export function SignOutButton() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return <>
    <Button ref={triggerRef} type="button" variant="ghost" className="sidebar-signout" onClick={() => setOpen(true)}><LogOut size={16} />Sign out</Button>
    <SignOutConfirmation open={open} onOpenChange={setOpen} returnFocus={triggerRef} />
  </>;
}

export function AdminProfileMenu({ profile, storeName }: { profile: OwnerProfile; storeName: string }) {
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button ref={triggerRef} variant="ghost" className="admin-profile-trigger" aria-label={`Open profile menu for ${profile.name}`} />}>
        <Avatar className="admin-profile-avatar"><AvatarFallback>{profile.initials}</AvatarFallback></Avatar>
        <ChevronDown size={13} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="admin-profile-menu" aria-label="Your account">
        <div className="admin-profile-details">
          <span className="admin-profile-role">Store owner</span>
          <strong>{profile.name}</strong>
          {profile.email && <span className="admin-profile-email">{profile.email}</span>}
          <span className="admin-profile-store"><Store size={13} aria-hidden="true" />{storeName}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/admin/settings" />}><Settings size={16} />Store settings</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setConfirmSignOut(true)}><LogOut size={16} />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <SignOutConfirmation open={confirmSignOut} onOpenChange={setConfirmSignOut} returnFocus={triggerRef} />
  </>;
}
