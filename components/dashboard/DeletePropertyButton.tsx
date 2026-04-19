"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface Props {
  propertyId: string
  propertyName: string
}

export default function DeletePropertyButton({ propertyId, propertyName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from("properties")
      .delete()
      .eq("id", propertyId)

    if (error) {
      toast.error("Failed to delete property.")
    } else {
      toast.success(`${propertyName} deleted.`)
      setOpen(false)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-[#4b5563] hover:text-red-400 transition-colors"
        title="Delete property"
      >
        <Trash2 size={13} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#131929] border-[#1e2d45] text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {propertyName}?</DialogTitle>
          </DialogHeader>
          <p className="text-[#9ca3af] text-sm">
            This will permanently delete the property and all associated tenant records, interventions, and utility audits. This cannot be undone.
          </p>
          <div className="flex gap-3 mt-2">
            <Button
              onClick={handleDelete}
              disabled={loading}
              className="bg-red-500 hover:bg-red-600 text-white font-semibold flex-1"
            >
              {loading ? "Deleting…" : "Yes, Delete"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-[#1e2d45] text-white hover:bg-[#1e2d45] flex-1"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
