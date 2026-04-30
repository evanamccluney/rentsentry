import { createClient } from "@/lib/supabase/server"
import ImportWizard from "@/components/dashboard/ImportWizard"

export default async function ImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("user_id", user!.id)
    .order("name")

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-white text-xl font-bold">Import Tenants</h1>
        <p className="text-[#4b5563] text-sm mt-1">
          Bring in your existing tenants from Yardi, AppFolio, Buildium, Rent Manager, or a spreadsheet.
        </p>
      </div>
      <ImportWizard properties={properties ?? []} />
    </div>
  )
}
