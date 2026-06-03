const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const welcomeHtml = `


  


  


    
      
        



          
          
            
              


                HedgeFun.
              


              


                Market Intelligence
              


            
          

          
          
            

              


                You're in. Welcome to Market Bullets.
              



              


                Every weekday morning, before the market opens, we'll send you a free 2-minute brief that cuts through the noise.
              



              
              


                What you'll get
              



              
              


                
                  
                    


                      
                        
                          →
                        
                        
                          A quick snapshot of the major market indexes
                        
                      
                    


                  
                
                
                  
                    


                      
                        
                          →
                        
                        
                          The top market-moving stories, in bullet points
                        
                      
                    


                  
                
                
                  
                    


                      
                        
                          →
                        
                        
                          Key earnings reports and IPOs to watch
                        
                      
                    


                  
                
                
                  
                    


                      
                        
                          →
                        
                        
                          Only high-quality sources — zero clickbait
                        
                      
                    


                  
                
              



              
              


                
                  
                    
                      Open HedgeFun →
                    
                  
                
              



            
          

          
          
            
              


                You're receiving this because you subscribed at hedgefun.fun.

                © 2026 HedgeFun.fun  · 
                Unsubscribe
              


            
          

        


      
    



`;

    const adminHtml = `



  


    
      
        

HedgeFun · New Subscriber


        

📬 New subscriber joined


        


          Email: ${email}
        


        


          Subscribed at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET
        


      
    



`;

    // Send welcome email to subscriber
    const welcomeRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "HedgeFun <newsletter@send.hedgefun.fun>",
        to: [email],
        subject: "You're in — HedgeFun Market Bullets starts tomorrow 📈",
        html: welcomeHtml,
      }),
    });

    if (!welcomeRes.ok) {
      const err = await welcomeRes.text();
      console.error("Welcome email error:", err);
      return new Response(JSON.stringify({ error: "Welcome email failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send admin notification — non-blocking
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "HedgeFun <newsletter@send.hedgefun.fun>",
        to: ["akacarlosacosta@gmail.com"],
        subject: `📬 New subscriber: ${email}`,
        html: adminHtml,
      }),
    }).catch((err) => console.error("Admin notification error:", err));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
