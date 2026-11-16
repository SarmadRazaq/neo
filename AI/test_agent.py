#!/usr/bin/env python3
"""
Quick test script to verify LiveKit agent is working.
Run with: doppler run -- python test_agent.py
"""
import asyncio
import os
from livekit import api, rtc

async def test_agent():
    # Get credentials from environment (Doppler)
    url = os.getenv("LIVEKIT_URL")
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    
    if not all([url, api_key, api_secret]):
        print("❌ Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET")
        print("   Run with: doppler run -- python test_agent.py")
        return
    
    print(f"🔗 Connecting to: {url}")
    
    # Create a test room
    room_name = "test-agent-room"
    lk_api = api.LiveKitAPI(url, api_key, api_secret)
    
    # Create room (triggers agent dispatch)
    try:
        room_info = await lk_api.room.create_room(api.CreateRoomRequest(name=room_name))
        print(f"✅ Room created: {room_info.name}")
    except Exception as e:
        print(f"⚠️  Room may already exist: {e}")
    
    # List participants to see if agent joined
    print("⏳ Waiting 5 seconds for agent to join...")
    await asyncio.sleep(5)
    
    try:
        participants = await lk_api.room.list_participants(api.ListParticipantsRequest(room=room_name))
        print(f"\n📋 Participants in room:")
        for p in participants.participants:
            print(f"   - {p.identity} ({'agent' if 'agent' in p.identity.lower() else 'user'})")
        
        if len(participants.participants) > 0:
            print("\n✅ Agent successfully joined the room!")
        else:
            print("\n⚠️  No participants yet. Agent may take a moment to join.")
    except Exception as e:
        print(f"❌ Error listing participants: {e}")
    
    # Cleanup - delete the test room
    try:
        await lk_api.room.delete_room(api.DeleteRoomRequest(room=room_name))
        print(f"🧹 Cleaned up test room")
    except:
        pass
    
    await lk_api.aclose()

if __name__ == "__main__":
    asyncio.run(test_agent())
