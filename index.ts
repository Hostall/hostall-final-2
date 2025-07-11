import { serve } from "https://deno.land/std@0.208.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface BackupRequest {
  trigger: string
  timestamp: string
  tables?: string[]
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { trigger, timestamp, tables }: BackupRequest = await req.json()

    console.log(`Starting backup triggered by: ${trigger} at ${timestamp}`)

    // Default tables to backup
    const tablesToBackup = tables || ['hostels', 'admins', 'contact_messages', 'feedback']
    const backupResults = []

    for (const table of tablesToBackup) {
      try {
        console.log(`Backing up table: ${table}`)
        
        // Call the backup function we created earlier
        const { error } = await supabase.rpc('backup_critical_data')
        
        if (error) {
          console.error(`Backup failed for table ${table}:`, error)
          backupResults.push({
            table,
            status: 'failed',
            error: error.message
          })
        } else {
          console.log(`Backup successful for table: ${table}`)
          backupResults.push({
            table,
            status: 'success'
          })
        }
      } catch (error) {
        console.error(`Backup error for table ${table}:`, error)
        backupResults.push({
          table,
          status: 'error',
          error: error.message
        })
      }
    }

    // Log the backup operation
    const { error: logError } = await supabase
      .from('security_events')
      .insert({
        event_type: 'data_backup',
        details: {
          trigger,
          timestamp,
          tables: tablesToBackup,
          results: backupResults,
          backup_id: crypto.randomUUID()
        }
      })

    if (logError) {
      console.error('Failed to log backup operation:', logError)
    }

    // Cleanup old backups (keep only last 7 days)
    try {
      const { error: cleanupError } = await supabase.rpc('purge_old_backups')
      if (cleanupError) {
        console.error('Cleanup failed:', cleanupError)
      } else {
        console.log('Old backups cleaned up successfully')
      }
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError)
    }

    // Send backup status notification
    await sendBackupNotification(trigger, backupResults)

    const successfulBackups = backupResults.filter(r => r.status === 'success').length
    const totalBackups = backupResults.length

    return new Response(
      JSON.stringify({
        success: true,
        message: `Backup completed: ${successfulBackups}/${totalBackups} tables backed up successfully`,
        timestamp: new Date().toISOString(),
        results: backupResults
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Backup function error:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

async function sendBackupNotification(trigger: string, results: any[]) {
  try {
    const webhookUrl = Deno.env.get('BACKUP_WEBHOOK_URL')
    
    if (webhookUrl) {
      const successCount = results.filter(r => r.status === 'success').length
      const totalCount = results.length
      const isSuccess = successCount === totalCount

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${isSuccess ? '✅' : '⚠️'} HOSTALL Data Backup ${isSuccess ? 'Completed' : 'Partial'}`,
          attachments: [{
            color: isSuccess ? 'good' : 'warning',
            fields: [
              { title: 'Trigger', value: trigger, short: true },
              { title: 'Success Rate', value: `${successCount}/${totalCount}`, short: true },
              { title: 'Timestamp', value: new Date().toISOString(), short: false }
            ]
          }]
        })
      })
    }
  } catch (error) {
    console.error('Backup notification failed:', error)
  }
}